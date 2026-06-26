#!/usr/bin/env python3
"""Garage Saathi — dev sync + auth + file server.

A tiny shared "cloud" so multiple devices reconcile their data, now with:
  - Accounts:  server-side users with salted+hashed PINs and login tokens.
  - Auth:      /push, /pull and /upload require a valid Bearer token (401 otherwise).
  - Photos:    /upload stores image bytes as files; only the URL syncs in records.

Conflict rule stays last-write-wins by the client's `updatedAt`. This exists to
DEMONSTRATE the production architecture locally; swap for Supabase / hosted Node
(same endpoints) for real deployment.

Run:  python3 sync_server.py        (listens on 0.0.0.0:8766)
"""
import base64
import hashlib
import json
import math
import os
import sqlite3
import threading
import time
import urllib.request
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DB = os.environ.get("DB_PATH", "sync.db")
UPLOADS = os.environ.get("UPLOADS_DIR", "uploads")
PORT = int(os.environ.get("PORT", "8766"))      # cloud hosts inject $PORT
_lock = threading.Lock()
SESSIONS = {}          # token -> {uid, exp}
SESSION_TTL = int(os.environ.get("SESSION_TTL_SEC", str(12 * 3600)))   # 12h
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
# Launch hardening knobs (safe defaults preserve dev behaviour):
#   ENABLE_DEMO_SEED=0  → do NOT seed the demo staff accounts (real deployment)
#   MAX_UPLOAD_MB       → reject oversized photo uploads (DoS guard)
#   ANTHROPIC_API_KEY   → enables the server-side /ai proxy (keeps the key off devices)
ENABLE_DEMO_SEED = os.environ.get("ENABLE_DEMO_SEED", "1") != "0"
# GPS safety/misuse detection thresholds (configurable).
OVERSPEED_KPH = float(os.environ.get("OVERSPEED_KPH", "80"))
HARSH_DROP_KPH = float(os.environ.get("HARSH_DROP_KPH", "30"))   # speed drop in one push interval
IDLE_MIN = int(os.environ.get("IDLE_MIN", "15"))                  # engine-on, not moving, minutes
NIGHT_START_IST, NIGHT_END_IST = 23, 5                            # night-movement window (IST)

# Web push (VAPID). Public key is safe to ship to the browser; the private key
# stays server-side (local .vapid_private.pem, or the VAPID_PRIVATE_KEY env var).
VAPID_PUBLIC = os.environ.get("VAPID_PUBLIC", "BPbZL6mTam86eXAc8zT4vDCnP-0huKTqogZVEWjkUrhEkpIIS-V_kdFC9o78Ibu55ln7QSqUaoVT0Uq7lWX7-r8")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:mahalaxmitravels96@gmail.com")
try:
    from pywebpush import webpush, WebPushException   # installed via requirements.txt on the host
    _WEBPUSH = True
except Exception:
    _WEBPUSH = False

def _vapid_pem_path():
    if os.path.exists(".vapid_private.pem"):
        return ".vapid_private.pem"
    pem = os.environ.get("VAPID_PRIVATE_KEY", "")
    if pem:
        p = "/tmp/vapid_private.pem"
        with open(p, "w") as f:
            f.write(pem.replace("\\n", "\n"))
        return p
    return None
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "8")) * 1024 * 1024
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()

# Login brute-force protection: lock a user (and the source IP) after too many
# failed PIN attempts inside a rolling window.
LOGIN_FAILS = {}       # key -> [timestamps]
MAX_FAILS = int(os.environ.get("MAX_LOGIN_FAILS", "5"))        # per user (strict)
# Per-IP backstop is generous: a whole garage of staff shares one public IP, so
# this must only catch a runaway script, not normal fat-fingering.
MAX_IP_FAILS = int(os.environ.get("MAX_IP_FAILS", "50"))
LOCK_WINDOW = int(os.environ.get("LOGIN_LOCK_SEC", "900"))     # 15 min

# Mirrors the client seed so the same demo PINs work against the server.
SEED_USERS = [
    ("u-owner", "Bhuwan (Owner)", "owner", "1111"),
    ("u-sup", "Ramesh (Supervisor)", "supervisor", "2222"),
    ("u-store", "Suresh (Store)", "store", "3333"),
    ("u-m1", "Mukesh", "mechanic", "0001"),
    ("u-m2", "Imran", "mechanic", "0002"),
    ("u-m3", "Vijay", "mechanic", "0003"),
    ("u-d1", "Ramlal (Driver)", "driver", "0010"),
]


def db():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS records(
        store TEXT, id TEXT, data TEXT, updatedAt INTEGER, rev INTEGER,
        PRIMARY KEY(store, id))""")
    c.execute("""CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY, name TEXT, role TEXT, salt TEXT, pin_hash TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS pushsubs(
        endpoint TEXT PRIMARY KEY, sub TEXT, role TEXT, at INTEGER)""")
    return c


def hash_pin(salt, pin):
    return hashlib.sha256((salt + str(pin)).encode()).hexdigest()


def now_ms():
    return int(time.time() * 1000)


def _upsert_record(c, store, rid, data, updated, base_rev):
    """Insert/update a record with a fresh rev. Returns the new rev."""
    rev = base_rev + 1
    c.execute("""INSERT INTO records(store,id,data,updatedAt,rev) VALUES(?,?,?,?,?)
                 ON CONFLICT(store,id) DO UPDATE SET
                   data=excluded.data, updatedAt=excluded.updatedAt, rev=excluded.rev""",
              (store, rid, json.dumps(data), updated, rev))
    return rev


def seed_users():
    with _lock:
        c = db()
        for uid, name, role, pin in SEED_USERS:
            if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                salt = uuid.uuid4().hex
                c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                          (uid, name, role, salt, hash_pin(salt, pin)))
                # publish a PIN-FREE user record so devices see the roster but never
                # the credential (PINs live only as salted hashes, server-side).
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "users", uid,
                               {"id": uid, "name": name, "role": role}, now_ms(), rev)
        c.commit()
        c.close()


# ----------------------------- auth helpers --------------------------------
def locked_for(uid, ip):
    """Seconds remaining if the user (strict) or IP (generous) is locked, else 0."""
    now = time.time()
    for key, limit in ((uid, MAX_FAILS), ("ip:" + ip, MAX_IP_FAILS)):
        arr = [t for t in LOGIN_FAILS.get(key, []) if now - t < LOCK_WINDOW]
        LOGIN_FAILS[key] = arr
        if len(arr) >= limit:
            return int(LOCK_WINDOW - (now - arr[0])) + 1
    return 0


def record_fail(uid, ip):
    now = time.time()
    for key in (uid, "ip:" + ip):
        LOGIN_FAILS.setdefault(key, []).append(now)


def clear_fails(uid, ip):
    LOGIN_FAILS.pop(uid, None)
    LOGIN_FAILS.pop("ip:" + ip, None)


def do_login(user_id, pin):
    c = db()
    row = c.execute("SELECT id,name,role,salt,pin_hash FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    if not row or hash_pin(row[3], pin) != row[4]:
        return None
    token = uuid.uuid4().hex
    SESSIONS[token] = {"uid": row[0], "exp": time.time() + SESSION_TTL}
    return {"token": token, "user": {"id": row[0], "name": row[1], "role": row[2]}}


def user_for_token(token):
    s = SESSIONS.get(token or "")
    if not s:
        return None
    if s["exp"] < time.time():            # expired → force re-login
        SESSIONS.pop(token, None)
        return None
    c = db()
    row = c.execute("SELECT id,name,role FROM users WHERE id=?", (s["uid"],)).fetchone()
    c.close()
    return {"id": row[0], "name": row[1], "role": row[2]} if row else None


def create_user(name, role, pin):
    uid = "u-" + uuid.uuid4().hex[:6]
    salt = uuid.uuid4().hex
    with _lock:
        c = db()
        c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                  (uid, name, role, salt, hash_pin(salt, pin)))
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "users", uid, {"id": uid, "name": name, "role": role}, now_ms(), rev)
        c.commit()
        c.close()
    return {"id": uid, "name": name, "role": role}


def set_pin(user_id, pin):
    """Rotate a user's PIN (new salt + hash). Returns False if no such user."""
    with _lock:
        c = db()
        row = c.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            c.close()
            return False
        salt = uuid.uuid4().hex
        c.execute("UPDATE users SET salt=?, pin_hash=? WHERE id=?", (salt, hash_pin(salt, pin), user_id))
        c.commit()
        c.close()
    return True


# ----------------------------- sync helpers --------------------------------
def push(records):
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        applied = 0
        for r in records:
            store, rid = r.get("store"), r.get("id")
            upd = int(r.get("updatedAt") or 0)
            if not store or not rid:
                continue
            row = c.execute("SELECT updatedAt FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
            if row is None or upd > (row[0] or 0):
                rev = _upsert_record(c, store, rid, r.get("data"), upd, rev)
                applied += 1
        c.commit()
        c.close()
        return {"ok": True, "applied": applied, "maxRev": rev}


def pull(since):
    with _lock:
        c = db()
        rows = c.execute("SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? ORDER BY rev ASC",
                         (since,)).fetchall()
        maxrev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        c.close()
    recs = [{"store": s, "id": i, "data": json.loads(d), "updatedAt": u, "rev": rv}
            for (s, i, d, u, rv) in rows]
    return {"records": recs, "maxRev": maxrev}


# ----------------------------- GPS simulator -------------------------------
# Stands in for the bus tracker's API. The client adapter (GpsProvider in app.js)
# calls GET /gps?busId=..&odo=.. ; swap this for the real provider in production.
GPS_STATE = {}                 # busId -> {t0, odo0}   (simulator fallback)
LIVE_GPS = {}                  # normalised reg -> latest real telemetry from provider
JAIPUR = (26.9124, 75.7873)

# Dedicated token the GPS provider (AirFi) uses for /gps/ingest. Sourced from the
# GPS_INGEST_TOKEN env var, falling back to the git-ignored .gps_ingest_token file.
# No insecure default: if it's unset (or still a demo placeholder), /gps/ingest is
# refused so nobody can push fake telemetry.
def _read_gps_token():
    t = os.environ.get("GPS_INGEST_TOKEN", "").strip()
    if t:
        return t
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gps_ingest_token")) as f:
            return f.read().strip()
    except Exception:
        return ""
GPS_INGEST_TOKEN = _read_gps_token()
_GPS_TOKEN_OK = bool(GPS_INGEST_TOKEN) and "demo" not in GPS_INGEST_TOKEN.lower() and "change-me" not in GPS_INGEST_TOKEN.lower()


def norm_reg(s):
    return (s or "").upper().replace(" ", "").replace("-", "")


def iso_ms(s):
    try:
        return int(datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return int(time.time() * 1000)


def _ist_hour(ms):
    return int(((ms / 1000 + 5.5 * 3600) % 86400) // 3600)

def ingest_gps(events):
    accepted = 0
    new_events = []          # safety/misuse events detected this batch
    for e in events or []:
        reg = norm_reg(e.get("vehicleReg") or e.get("deviceId"))
        if not reg:
            continue
        spd = float(e.get("speedKph") or 0)
        ign = bool(e.get("ignition"))
        ts = iso_ms(e.get("timestamp"))
        lat, lng = e.get("lat"), e.get("lng")
        disp = (e.get("vehicleReg") or e.get("deviceId") or "").strip()
        p = LIVE_GPS.get(reg) or {}
        night = _ist_hour(ts) >= NIGHT_START_IST or _ist_hour(ts) < NIGHT_END_IST

        def mkev(t, v):
            new_events.append({"id": "ev-" + uuid.uuid4().hex[:10], "reg": disp or reg, "type": t,
                               "value": round(float(v), 1), "lat": lat, "lng": lng, "at": ts})
        # Overspeed — only on the transition into overspeed (one event per episode).
        if spd >= OVERSPEED_KPH and p.get("speedKph", 0) < OVERSPEED_KPH:
            mkev("overspeed", spd)
        # Harsh braking — large speed drop in a single interval.
        if p and (p.get("speedKph", 0) - spd) >= HARSH_DROP_KPH and spd < p.get("speedKph", 0):
            mkev("harshbrake", p.get("speedKph", 0) - spd)
        # Night movement — moving during the night window (debounced to 30 min).
        last_night = p.get("_lastNight", 0)
        if ign and spd > 5 and night and (ts - last_night) > 30 * 60 * 1000:
            mkev("night", spd); last_night = ts
        # Long idle — engine on, not moving, ≥ IDLE_MIN (one event per episode).
        idle_start, idle_logged = p.get("_idleStart"), p.get("_idleLogged", False)
        if ign and spd < 2:
            if not idle_start:
                idle_start = ts
            if not idle_logged and (ts - idle_start) >= IDLE_MIN * 60 * 1000:
                mkev("idle", (ts - idle_start) / 60000.0); idle_logged = True
        else:
            idle_start, idle_logged = None, False

        LIVE_GPS[reg] = {
            "lat": lat, "lng": lng, "speedKph": spd, "ignition": ign,
            "odometer": int(float(e.get("odometerKm") or 0)), "lastPing": ts,
            "deviceId": e.get("deviceId"), "reg": disp,
            "_idleStart": idle_start, "_idleLogged": idle_logged, "_lastNight": last_night,
        }
        accepted += 1
    if new_events:
        with _lock:
            c = db()
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            now = now_ms()
            for ev in new_events:
                rev = _upsert_record(c, "gpsevents", ev["id"], ev, now, rev)
            c.commit(); c.close()
        # Push the most urgent misuse signal (night movement) to owners/supervisors.
        for ev in new_events:
            if ev["type"] == "night":
                send_push("🌙 Night movement", f"{ev['reg']} is moving at night — confirm it's an authorised trip.", "/")
    return {"ok": True, "accepted": accepted, "events": len(new_events)}


def save_pushsub(sub, role):
    ep = sub.get("endpoint") if isinstance(sub, dict) else None
    if not ep:
        return False
    with _lock:
        c = db()
        c.execute("INSERT OR REPLACE INTO pushsubs(endpoint,sub,role,at) VALUES(?,?,?,?)",
                  (ep, json.dumps(sub), role or "owner", now_ms()))
        c.commit(); c.close()
    return True


def _del_pushsub(ep):
    with _lock:
        c = db(); c.execute("DELETE FROM pushsubs WHERE endpoint=?", (ep,)); c.commit(); c.close()


def send_push(title, body, url="/", roles=("owner", "supervisor")):
    """Send a web-push to stored subscriptions. roles=None → everyone."""
    if not _WEBPUSH:
        return 0
    pem = _vapid_pem_path()
    if not pem:
        return 0
    with _lock:
        c = db()
        rows = c.execute("SELECT endpoint,sub,role FROM pushsubs").fetchall()
        c.close()
    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    for ep, sub_json, role in rows:
        if roles and role not in roles:
            continue
        try:
            webpush(subscription_info=json.loads(sub_json), data=payload,
                    vapid_private_key=pem, vapid_claims={"sub": VAPID_SUBJECT})
            sent += 1
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):      # gone/expired → drop the dead subscription
                _del_pushsub(ep)
        except Exception:
            pass
    return sent


def gps_telemetry(bus_id, odo, reg=None):
    # Prefer REAL provider data once AirFi is pushing it for this registration.
    live = LIVE_GPS.get(norm_reg(reg))
    if live:
        return {"busId": bus_id, "source": "provider", **live}
    # Otherwise fall back to the local simulator so the app is demo-able offline.
    t = time.time()
    with _lock:
        st = GPS_STATE.get(bus_id)
        if not st:
            st = {"t0": t, "odo0": float(odo or 0)}
            GPS_STATE[bus_id] = st
    elapsed = t - st["t0"]
    phase = (int(hashlib.sha256(bus_id.encode()).hexdigest(), 16) % 360) * math.pi / 180
    speed = max(0.0, 46 * math.sin(elapsed / 40.0 + phase))          # km/h, 0 = parked
    odometer = int(st["odo0"] + (elapsed / 3600.0) * 230)
    lat = JAIPUR[0] + 0.02 * math.sin(elapsed / 120.0 + phase)
    lng = JAIPUR[1] + 0.02 * math.cos(elapsed / 120.0 + phase)
    return {"busId": bus_id, "source": "simulated", "lat": round(lat, 5), "lng": round(lng, 5),
            "speedKph": round(speed, 1), "ignition": speed > 1,
            "odometer": odometer, "lastPing": int(t * 1000)}


def save_upload(data_url, host):
    head, _, b64 = data_url.partition(",")
    ext = "png" if "image/png" in head else "jpg"
    name = uuid.uuid4().hex + "." + ext
    os.makedirs(UPLOADS, exist_ok=True)
    with open(os.path.join(UPLOADS, name), "wb") as f:
        f.write(base64.b64decode(b64))
    return {"url": f"http://{host}/uploads/{name}"}


# ------------------------------- HTTP --------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload=None, raw=None, ctype="application/json"):
        if raw is not None:
            body = raw
        else:
            body = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def _auth_user(self):
        h = self.headers.get("Authorization") or ""
        token = h[7:] if h.startswith("Bearer ") else ""
        return user_for_token(token)

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/health"):
            return self._send(200, {"ok": True, "service": "garage-saathi-sync"})
        if u.path.startswith("/uploads/"):
            name = os.path.basename(u.path)
            fp = os.path.join(UPLOADS, name)
            if not os.path.isfile(fp):
                return self._send(404, {"error": "not found"})
            ct = "image/png" if name.endswith(".png") else "image/jpeg"
            with open(fp, "rb") as f:
                return self._send(200, raw=f.read(), ctype=ct)
        if u.path == "/pull":
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            since = int((parse_qs(u.query).get("since") or ["0"])[0])
            return self._send(200, pull(since))
        if u.path == "/gps":
            q = parse_qs(u.query)
            bus_id = (q.get("busId") or [""])[0]
            if not bus_id:
                return self._send(400, {"error": "busId required"})
            odo = float((q.get("odo") or ["0"])[0] or 0)
            reg = (q.get("reg") or [""])[0]
            return self._send(200, gps_telemetry(bus_id, odo, reg))
        if u.path == "/push/vapid":                   # public VAPID key for the browser to subscribe
            return self._send(200, {"publicKey": VAPID_PUBLIC, "enabled": _WEBPUSH and bool(_vapid_pem_path())})
        if u.path == "/gps/latest":                  # provider self-check
            reg = (parse_qs(u.query).get("reg") or [""])[0]
            data = LIVE_GPS.get(norm_reg(reg))
            return self._send(200 if data else 404, data or {"error": "no telemetry for reg"})
        if u.path == "/gps/fleet":                    # every registration AirFi has pushed
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            buses = [{"reg": v.get("reg") or k, "odometer": v.get("odometer"), "lastPing": v.get("lastPing"),
                      "lat": v.get("lat"), "lng": v.get("lng"), "speedKph": v.get("speedKph"), "ignition": v.get("ignition")}
                     for k, v in LIVE_GPS.items()]
            return self._send(200, {"buses": sorted(buses, key=lambda b: b["reg"])})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/auth/login":
            b = self._body()
            uid = b.get("userId") or ""
            ip = (self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                  or self.client_address[0])
            wait = locked_for(uid, ip)
            if wait:
                return self._send(429, {"error": "too many attempts", "retryAfterSec": wait})
            r = do_login(uid, b.get("pin"))
            if not r:
                record_fail(uid, ip)
                return self._send(401, {"error": "invalid PIN"})
            clear_fails(uid, ip)
            return self._send(200, r)

        if u.path == "/auth/users":          # create staff (owner/supervisor only)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            name, role, pin = (b.get("name") or "").strip(), b.get("role") or "mechanic", b.get("pin") or ""
            if not name or not pin:
                return self._send(400, {"error": "name and pin required"})
            return self._send(200, {"user": create_user(name, role, pin)})

        if u.path == "/auth/setpin":         # change own PIN, or owner/supervisor reset staff
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            target = b.get("userId") or me["id"]
            pin = str(b.get("pin") or "")
            if not (len(pin) == 4 and pin.isdigit()):
                return self._send(400, {"error": "pin must be 4 digits"})
            # Only self, or a manager changing someone else's.
            if target != me["id"] and me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            if not set_pin(target, pin):
                return self._send(404, {"error": "no such user"})
            return self._send(200, {"ok": True})

        if u.path == "/push":
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            return self._send(200, push(self._body().get("records") or []))

        if u.path == "/upload":
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            if int(self.headers.get("Content-Length") or 0) > MAX_UPLOAD_BYTES:
                return self._send(413, {"error": f"upload too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)"})
            data = self._body().get("data") or ""
            if not data.startswith("data:"):
                return self._send(400, {"error": "expected data URL"})
            return self._send(200, save_upload(data, self.headers.get("Host", f"localhost:{PORT}")))

        if u.path == "/ai":          # server-side Anthropic proxy — keeps the API key OFF devices
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            if not ANTHROPIC_API_KEY:
                return self._send(501, {"error": "AI not configured on server"})
            b = self._body()
            question = (b.get("question") or "").strip()
            context = (b.get("context") or "").strip()
            biz = (b.get("biz") or "the garage").strip()
            if not question:
                return self._send(400, {"error": "question required"})
            try:
                payload = json.dumps({
                    "model": b.get("model") or "claude-haiku-4-5-20251001",
                    "max_tokens": 500,
                    "system": f"You are the operations advisor for {biz}, a bus maintenance garage in Jaipur, India. Be concise and practical, use rupee (Rs) figures, focus on cutting cost and pilferage. Max 6 sentences.",
                    "messages": [{"role": "user", "content": f"Current garage data:\n{context}\n\nQuestion: {question}"}],
                }).encode()
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=payload, method="POST", headers={
                    "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    j = json.loads(resp.read())
                text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()
                return self._send(200, {"text": text})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error"})

        if u.path == "/push/subscribe":              # browser registers for web-push
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            ok = save_pushsub(b.get("subscription"), b.get("role") or me["role"])
            return self._send(200 if ok else 400, {"ok": ok})

        if u.path == "/push/test":                   # send a test alert to the caller's role
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            n = send_push("Garage Saathi", "✅ Test alert — phone notifications are working.", "/", roles=None)
            return self._send(200, {"ok": True, "sent": n, "webpush": _WEBPUSH})

        if u.path == "/gps/ingest":                  # GPS provider pushes telemetry here
            if not _GPS_TOKEN_OK:                     # no real token configured → ingest disabled
                return self._send(503, {"error": "gps ingest disabled — set GPS_INGEST_TOKEN"})
            h = self.headers.get("Authorization") or ""
            if h != "Bearer " + GPS_INGEST_TOKEN:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            events = b.get("events") if isinstance(b, dict) else None
            if events is None:
                return self._send(400, {"error": "expected {events:[...]}"})
            return self._send(200, ingest_gps(events))

        self._send(404, {"error": "not found"})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    db().close()
    if ENABLE_DEMO_SEED:
        seed_users()
    else:
        print("ENABLE_DEMO_SEED=0 → skipping demo staff accounts (real deployment)")
    os.makedirs(UPLOADS, exist_ok=True)
    if ALLOWED_ORIGIN == "*":
        print("WARNING: ALLOWED_ORIGIN=* (open CORS). Set it to your PWA domain before production.")
    if not _GPS_TOKEN_OK:
        print("NOTE: GPS_INGEST_TOKEN not set (or demo) → /gps/ingest is disabled.")
    print(f"AI advisor proxy: {'ENABLED (/ai)' if ANTHROPIC_API_KEY else 'disabled (set ANTHROPIC_API_KEY)'}")
    print(f"Garage Saathi sync server on http://0.0.0.0:{PORT}  (db: {DB}, uploads: {UPLOADS}/)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

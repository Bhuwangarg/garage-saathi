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
import hmac
import secrets as _secrets
import json
import math
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import wa_client
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, urlencode

DB = os.environ.get("DB_PATH", "sync.db")
UPLOADS = os.environ.get("UPLOADS_DIR", "uploads")
# Free persistence: point at a Turso (libSQL) database when these are set.
# Same SQL — Turso *is* SQLite — so nothing else in the server changes.
# Accept either our name or Turso's conventional TURSO_DATABASE_URL.
TURSO_URL = os.environ.get("TURSO_URL", "") or os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")
# Postgres (Supabase). Takes precedence over everything else when set: it is the
# only option here that is durable without a paid disk.
DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
_USE_PG = bool(DATABASE_URL)
_USE_TURSO = bool(TURSO_URL and TURSO_TOKEN) and not _USE_PG
# Is the SQLite file on a mounted disk that survives a redeploy? On Render the
# blueprint mounts one at /data; anywhere else say so explicitly. Without this the
# disk-backed path reports itself as ephemeral and looks like data loss waiting
# to happen, which is how Turso got added in the first place.
_DISK_PERSISTENT = (os.environ.get("DB_DISK_PERSISTENT", "") == "1"
                    or os.path.dirname(os.path.abspath(DB)) == "/data")
# Serving an EMPTY database is worse than serving nothing: staff log in, do a
# day's work, and it lands somewhere that is not the source of truth. So when
# Turso is configured and unreachable we refuse to start rather than fall back.
# Set ALLOW_SQLITE_FALLBACK=1 only as a deliberate emergency override.
_ALLOW_FALLBACK = os.environ.get("ALLOW_SQLITE_FALLBACK", "") == "1"


class DatabaseUnavailable(RuntimeError):
    pass


# Persistence has to be OBSERVED, not inferred. Reporting `persistent: true`
# because DB_PATH starts with /data says nothing about whether a disk is mounted
# there — an unmounted /data is ordinary container storage that resets on every
# restart, and the server cannot tell the difference from the path alone.
#
# So each boot appends a line to a marker file next to the database. If lines
# from an EARLIER boot are still there, the storage demonstrably survived a
# restart. That is proof rather than a guess.
_DISK_BOOTS = 0
_DISK_ERROR = None


def _record_boot():
    global _DISK_BOOTS, _DISK_ERROR
    path = os.path.join(os.path.dirname(os.path.abspath(DB)) or ".", ".boots")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        prior = []
        if os.path.exists(path):
            with open(path) as f:
                prior = [ln for ln in f.read().splitlines() if ln.strip()]
        # Keep the file small but keep the earliest line — it is the evidence.
        keep = (prior[:1] + prior[-40:]) if len(prior) > 41 else prior
        with open(path, "w") as f:
            f.write("\n".join(keep + ["%d %s" % (int(time.time()), BUILD_TAG)]) + "\n")
        _DISK_BOOTS = len(prior) + 1
    except Exception as e:
        _DISK_ERROR = str(e)
_SCHEMA_OK = False

# Free, persistent photo storage: Cloudflare R2 (S3-compatible, 10 GB free).
# Activated only when all of these are set; otherwise photos go to local disk
# (fine for dev, ephemeral on a free host). The bucket must have public read
# (an r2.dev URL or a custom domain) so the PWA can display the images.
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")   # e.g. https://pub-xxxx.r2.dev
_USE_R2 = bool(R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY and R2_BUCKET and R2_PUBLIC_URL)
_r2 = None
def _r2_client():
    global _r2
    if _r2 is None:
        import boto3  # lazy — only needed when R2 is configured
        _r2 = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY, aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
        )
    return _r2
# eChallan.app — traffic-violation lookup by registration number. Server-side only:
# their own docs say never to expose the key in browser-side widgets, and every
# device running this PWA would otherwise ship it. Set ECHALLAN_API_KEY in the host
# environment; without it the /challans endpoint reports "not configured" rather
# than failing obscurely.
ECHALLAN_API_KEY = os.environ.get("ECHALLAN_API_KEY", "")
ECHALLAN_BASE = os.environ.get("ECHALLAN_BASE", "https://api.echallan.app")

# Bumped by hand whenever a server change needs to be confirmed live. Render's
# auto-deploy is off, so setting an env var restarts the process with the OLD
# code — /health reporting a stale build is the only way to tell that apart from
# a missing route, without dashboard access.
BUILD_TAG = "2026-08-22-vercel-4"

PORT = int(os.environ.get("PORT", "8766"))      # cloud hosts inject $PORT
_lock = threading.Lock()
SESSIONS = {}          # token -> {uid, exp}
SESSION_TTL = int(os.environ.get("SESSION_TTL_SEC", str(12 * 3600)))   # 12h
# CORS allow-list. Default = the production PWA (GitHub Pages) only; any
# localhost/127.0.0.1 port is also allowed for dev. Override with ALLOWED_ORIGIN
# env: a comma-separated list of exact origins, or "*" to allow any (not for prod).
PROD_ORIGIN = "https://bhuwangarg.github.io"
_env_origin = os.environ.get("ALLOWED_ORIGIN", "").strip()
if _env_origin == "*":
    ALLOWED_ORIGINS = "*"
elif _env_origin:
    ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _env_origin.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = [PROD_ORIGIN]
_LOCALHOST_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
# The packaged iOS/Android app serves its bundled shell from a fixed synthetic
# origin — capacitor://localhost on iOS, https://localhost on Android — and
# sends it on every sync request. Without these the native apps get a CORS
# failure on /auth/login and never sync at all. These are not addressable by a
# remote site: a page would have to be served from the device's own localhost
# to claim one, the same assumption the http://localhost dev rule already makes.
_NATIVE_APP_ORIGIN = re.compile(r"^(capacitor|ionic)://localhost$|^https://localhost$")

def cors_origin_for(origin):
    """Echo the request Origin when it's allowed (so other sites are blocked);
    otherwise fall back to the production origin (a browser from a disallowed
    site then sees a mismatch and blocks the response)."""
    if ALLOWED_ORIGINS == "*":
        return origin or "*"
    if origin:
        o = origin.rstrip("/")
        if o in ALLOWED_ORIGINS or _LOCALHOST_ORIGIN.match(o) or _NATIVE_APP_ORIGIN.match(o):
            return origin
    return ALLOWED_ORIGINS[0]
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
    # 1) local dev file, or 2) a Render "Secret File" named vapid_private.pem
    #    (mounted at /etc/secrets/…), or 3) the VAPID_PRIVATE_KEY env var.
    for p in (".vapid_private.pem", "/etc/secrets/vapid_private.pem"):
        if os.path.exists(p):
            return p
    pem = os.environ.get("VAPID_PRIVATE_KEY", "")
    if pem:
        out = "/tmp/vapid_private.pem"
        with open(out, "w") as f:
            f.write(pem.replace("\\n", "\n"))
        return out
    return None
# Vercel caps a serverless request body at ~4.5 MB, and photos arrive as base64
# data URLs in the JSON body. Clamp the default there so an oversized photo gets a
# clear 413 from us instead of an opaque platform error the app cannot explain.
_ON_VERCEL = bool(os.environ.get("VERCEL"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "4" if _ON_VERCEL else "8")) * 1024 * 1024
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()

# Login brute-force protection: lock a user (and the source IP) after too many
# failed PIN attempts inside a rolling window.
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


class _PgCursor:
    """The slice of sqlite3's cursor the server actually uses."""

    def __init__(self, cur):
        self._cur = cur

    def fetchone(self):
        try:
            return self._cur.fetchone()
        except Exception:
            return None          # a statement that returns no rows (INSERT/DELETE)

    def fetchall(self):
        try:
            return self._cur.fetchall()
        except Exception:
            return []


class _PgConn:
    """sqlite3-shaped facade over psycopg.

    Every query in this file was written against sqlite3: `conn.execute()` returns
    something fetchable and `?` marks a parameter. psycopg wants an explicit cursor
    and `%s`. Translating here keeps ONE set of SQL rather than two dialects that
    drift apart — the statements themselves are already portable now that the
    INSERT OR REPLACEs are ON CONFLICT.

    One connection is shared for the life of the process, guarded by a lock:
    /pull runs on a 4-second timer on every device, and opening a fresh Postgres
    connection per request would be both slow and a good way to exhaust Supabase's
    connection limit. close() therefore commits and keeps the socket.
    """

    _lock = threading.Lock()

    def __init__(self, dsn):
        import psycopg
        self._psycopg = psycopg
        self._dsn = dsn
        self._c = self._open()

    def _open(self):
        # prepare_threshold=None disables psycopg's automatic PREPARE. Supabase's
        # pooler on port 6543 runs PgBouncer in transaction mode, where a prepared
        # statement can be issued on one backend and executed on another — the
        # classic "prepared statement does not exist" failure. Harmless on a direct
        # connection, required through the pooler, which is what serverless needs.
        return self._psycopg.connect(self._dsn, autocommit=False, prepare_threshold=None)

    def _reconnect(self):
        try:
            self._c.close()
        except Exception:
            pass
        self._c = self._open()

    def execute(self, sql, params=()):
        q = sql.replace("?", "%s")
        with _PgConn._lock:
            try:
                cur = self._c.cursor()
                cur.execute(q, tuple(params))
            except Exception:
                # A dropped connection (Supabase idles them out) must not take the
                # process down — reconnect once and retry before giving up.
                self._reconnect()
                cur = self._c.cursor()
                cur.execute(q, tuple(params))
            return _PgCursor(cur)

    def commit(self):
        with _PgConn._lock:
            self._c.commit()

    def close(self):
        # Deliberately NOT closing: the connection is shared and reused.
        self.commit()


# --------------------------- static PWA hosting ----------------------------
# On Vercel the frontend is served BY this function rather than from the CDN.
# Vercel builds the Python function and, with no framework detected, produces no
# static output — index.html/app.js/sw.js simply are not in the deployment, so
# every asset fell through here and 404'd. Serving them from the function keeps
# the repo layout intact (predeploy-gate.sh, mobile/build-www.mjs and the Android
# workflow all read the root) and behaves the same on Vercel, Render and locally.
APP_ROOT = os.path.dirname(os.path.abspath(__file__))
_CTYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
}
# Only these are ever served. An allow-list, so a stray file at the repo root can
# never be published by accident — sync.db and the VAPID key live here too.
_STATIC_OK = {".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".png",
              ".jpg", ".jpeg", ".ico", ".woff2", ".map"}


def _redact(msg):
    """Strip credentials out of a driver error before it reaches /health."""
    return re.sub(r"://[^@\s]*@", "://***@", str(msg))[:300]


def db_probe():
    """Actually run a query. dbMode said "postgres" whenever DATABASE_URL was set,
    which is not the same as the database being reachable — /health looked healthy
    while every write failed and login returned 500. Report what a round-trip does,
    not what the configuration implies."""
    try:
        c = db()
        c.execute("SELECT 1").fetchone()
        c.close()
        return True, None
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, _redact(e))


def _pg_host():
    """Host of DATABASE_URL for /health. Parsed rather than printed, so a password
    can never leak into a public endpoint."""
    if not _USE_PG:
        return None
    try:
        u = urlparse(DATABASE_URL)
        return "%s:%s" % (u.hostname or "?", u.port or 5432)
    except Exception:
        return "unparseable"


_PG_CONN = None
# A failing database must not be retried on every single request. /health probes
# the connection, the uptime cron pings /health, and every device polls /pull on a
# 4-second timer — with bad credentials that becomes a stream of failed logins,
# which is exactly what trips Supabase's pooler circuit breaker
# ("too many authentication failures, new connections are temporarily blocked").
# The breaker then hides whether the credentials were ever fixed. So remember a
# failure briefly and re-raise it without touching the network.
_PG_FAIL_AT = 0.0
_PG_FAIL_MSG = ""
PG_RETRY_AFTER = float(os.environ.get("PG_RETRY_AFTER_SEC", "20"))
_TURSO_OK = None   # None = not yet probed, True = auth works, False = failed → SQLite

def _connect():
    """A SQLite-compatible connection — Turso (remote, persistent) when configured
    AND reachable, otherwise the local SQLite file. libsql.connect() is lazy (it
    authenticates on the first query), so we probe once with SELECT 1: a bad token
    then fails HERE and we fall back cleanly instead of crashing mid-request."""
    global _TURSO_OK, _PG_CONN
    if _USE_PG:
        global _PG_FAIL_AT, _PG_FAIL_MSG
        if _PG_CONN is None:
            waited = time.time() - _PG_FAIL_AT
            if _PG_FAIL_MSG and waited < PG_RETRY_AFTER:
                raise DatabaseUnavailable(
                    "%s (cached %ds ago; not retrying for another %ds so a bad "
                    "credential cannot flood the pooler)"
                    % (_PG_FAIL_MSG, int(waited), int(PG_RETRY_AFTER - waited)))
            try:
                _PG_CONN = _PgConn(DATABASE_URL)
                _PG_FAIL_MSG = ""
            except Exception as e:
                _PG_FAIL_AT = time.time()
                _PG_FAIL_MSG = ("DATABASE_URL is set but Postgres is unreachable: %s" % e)
                raise DatabaseUnavailable(
                    "%s\nRefusing to fall back to a local SQLite file — writes made "
                    "against it would be stranded once Postgres returns." % _PG_FAIL_MSG)
        return _PG_CONN
    if _USE_TURSO and _TURSO_OK is not False:
        try:
            import libsql_experimental as libsql
            conn = libsql.connect(database=TURSO_URL, auth_token=TURSO_TOKEN)
            if _TURSO_OK is None:
                conn.execute("SELECT 1")          # force auth now (one-time probe)
                _TURSO_OK = True
                print("Turso connected OK (persistent).")
            return conn
        except Exception as e:
            _TURSO_OK = False
            if not _ALLOW_FALLBACK:
                raise DatabaseUnavailable(
                    "Turso is configured (TURSO_URL + TURSO_AUTH_TOKEN) but unreachable: %s\n"
                    "Refusing to serve from an empty local SQLite file — writes made against it "
                    "would be stranded when Turso comes back.\n"
                    "Fix the credentials, or unset TURSO_URL/TURSO_AUTH_TOKEN to run on the "
                    "mounted disk at %s, or set ALLOW_SQLITE_FALLBACK=1 to override." % (e, DB))
            print("WARNING: Turso unavailable — falling back to local SQLite "
                  "(ALLOW_SQLITE_FALLBACK=1 was set):", e)
    return sqlite3.connect(DB)


def db():
    global _SCHEMA_OK
    c = _connect()
    if not _SCHEMA_OK:                      # create the schema once per process
        c.execute("""CREATE TABLE IF NOT EXISTS records(
            store TEXT, id TEXT, data TEXT, updatedAt BIGINT, rev BIGINT,
            PRIMARY KEY(store, id))""")
        c.execute("""CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY, name TEXT, role TEXT, salt TEXT, pin_hash TEXT)""")
        c.execute("""CREATE TABLE IF NOT EXISTS pushsubs(
            endpoint TEXT PRIMARY KEY, sub TEXT, role TEXT, at BIGINT)""")
        # Private server-side key/value — NOT exposed via /pull (which only reads `records`).
        c.execute("""CREATE TABLE IF NOT EXISTS sys(k TEXT PRIMARY KEY, v TEXT)""")
        # Latest live GPS position per bus — persisted so the map survives restarts.
        c.execute("""CREATE TABLE IF NOT EXISTS gpslive(reg TEXT PRIMARY KEY, data TEXT, at BIGINT)""")
        # Failed logins. In a single long-running process an in-memory dict was
        # enough; across serverless containers each one would keep its own tally
        # and the 5-try lockout would effectively vanish — which matters a lot when
        # PINs are 4 digits and every crew account ships with 0000.
        c.execute("""CREATE TABLE IF NOT EXISTS loginfails(k TEXT, at BIGINT)""")
        c.execute("""CREATE INDEX IF NOT EXISTS loginfails_k ON loginfails(k)""")
        try:
            c.commit()
        except Exception:
            pass
        _SCHEMA_OK = True
    return c


_SECRET = None
def _session_secret():
    """Stable HMAC secret for signing session tokens. Persisted (Turso/SQLite) so
    tokens survive server restarts — fixes the cold-start 401 storm on Render free."""
    global _SECRET
    if _SECRET:
        return _SECRET
    with _lock:
        c = db()
        row = c.execute("SELECT v FROM sys WHERE k='session_secret'").fetchone()
        if row and row[0]:
            _SECRET = row[0]
        else:
            _SECRET = _secrets.token_hex(32)
            c.execute("INSERT INTO sys(k,v) VALUES('session_secret',?) "
                      "ON CONFLICT(k) DO UPDATE SET v=excluded.v", (_SECRET,))
            c.commit()
        c.close()
    return _SECRET


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


_BOOTSTRAPPED = False
_BOOT_LOCK = threading.Lock()


def bootstrap():
    """Everything that used to live under `if __name__ == "__main__"`.

    Vercel imports Handler and never runs the __main__ block, so on serverless
    none of this happened: no seeded owner account (nobody could log in, so the
    restore could not even authenticate), and ENABLE_DEMO_SEED=0 silently stopped
    purging the demo accounts whose PINs are published in this repo.

    Idempotent and cheap after the first call, so the request path can call it on
    every request and pay only a boolean check once a container is warm.
    """
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return
    with _BOOT_LOCK:
        if _BOOTSTRAPPED:
            return
        _load_live_gps()
        if ENABLE_DEMO_SEED:
            seed_users()
        else:
            purge_demo_users()
        _BOOTSTRAPPED = True


def purge_demo_users():
    """Remove demo accounts that ENABLE_DEMO_SEED created on an earlier boot.

    Turning the flag off only stops seeding — it does not delete what a previous
    run already inserted. Since the demo PINs are published in a public repo,
    leaving them behind on a real deployment is a live owner-level hole.

    An account is only removed if its stored hash still matches the demo PIN,
    i.e. nobody ever changed it. That is what makes this safe to run on every
    boot: the moment the owner sets a real PIN, their account stops matching and
    is kept.
    """
    with _lock:
        c = db()
        removed = []
        for uid, _name, _role, pin in SEED_USERS:
            row = c.execute("SELECT salt,pin_hash FROM users WHERE id=?", (uid,)).fetchone()
            if not row:
                continue
            if hash_pin(row[0], pin) == row[1]:
                c.execute("DELETE FROM users WHERE id=?", (uid,))
                c.execute("DELETE FROM records WHERE store='users' AND id=?", (uid,))
                removed.append(uid)
        c.commit()
        c.close()
    if removed:
        print("Removed demo accounts still using their published PINs: " + ", ".join(removed))
    return removed


# ----------------------------- auth helpers --------------------------------
def locked_for(uid, ip):
    """Seconds remaining if the user (strict) or IP (generous) is locked, else 0.

    Stored in the database rather than memory so the limit holds no matter which
    container answers the request.
    """
    now = int(time.time())
    cutoff = now - LOCK_WINDOW
    with _lock:
        c = db()
        c.execute("DELETE FROM loginfails WHERE at < ?", (cutoff,))
        out = 0
        for key, limit in ((uid, MAX_FAILS), ("ip:" + ip, MAX_IP_FAILS)):
            rows = c.execute("SELECT at FROM loginfails WHERE k=? AND at>=? ORDER BY at ASC",
                             (key, cutoff)).fetchall()
            if len(rows) >= limit:
                out = int(LOCK_WINDOW - (now - rows[0][0])) + 1
                break
        c.commit()
        c.close()
    return max(out, 0)


def record_fail(uid, ip):
    now = int(time.time())
    with _lock:
        c = db()
        for key in (uid, "ip:" + ip):
            c.execute("INSERT INTO loginfails(k,at) VALUES(?,?)", (key, now))
        c.commit()
        c.close()


def clear_fails(uid, ip):
    with _lock:
        c = db()
        c.execute("DELETE FROM loginfails WHERE k=? OR k=?", (uid, "ip:" + ip))
        c.commit()
        c.close()


def do_login(user_id, pin):
    c = db()
    row = c.execute("SELECT id,name,role,salt,pin_hash FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    if not row or hash_pin(row[3], pin) != row[4]:
        return None
    return {"token": _make_token(row[0]), "user": {"id": row[0], "name": row[1], "role": row[2]}}


def _make_token(uid):
    exp = int(time.time() + SESSION_TTL)
    payload = f"{uid}.{exp}"
    sig = hmac.new(_session_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def user_for_token(token):
    # Stateless: verify the HMAC signature + expiry — no in-memory session store,
    # so tokens stay valid across server restarts (no cold-start 401 storm).
    parts = (token or "").split(".")
    if len(parts) != 3:
        return None
    uid, exp, sig = parts
    try:
        if int(exp) < time.time():
            return None
    except ValueError:
        return None
    good = hmac.new(_session_secret().encode(), f"{uid}.{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        return None
    c = db()
    row = c.execute("SELECT id,name,role FROM users WHERE id=?", (uid,)).fetchone()
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
# Server-side write enforcement (mirrors the client PERMS matrix in app.js so no
# legitimate flow is denied). Allow-list: a role may push to a store only if listed.
# owner passes everything. An unknown store, or a role not listed, → denied (the
# record is rejected, the client quarantines it — it never wedges the outbox).
# This is the teeth behind the anti-pilferage gate: a driver/conductor/mechanic
# token can no longer forge a ledger/vendor/fleet row via a crafted request.
WRITE_ROLES = {
    "ledger":        {"owner", "supervisor", "store"},
    "purchases":     {"owner", "supervisor", "store"},
    "vendors":       {"owner", "supervisor", "store"},
    "components":    {"owner", "supervisor", "store"},
    "def":           {"owner", "supervisor", "store"},
    "fuel":          {"owner", "supervisor", "store"},
    "parts":         {"owner", "supervisor", "store"},
    "audits":        {"owner", "supervisor", "store"},
    "buses":         {"owner", "supervisor"},
    "routes":        {"owner", "supervisor"},
    "drivers":       {"owner", "supervisor"},
    "incidents":     {"owner", "supervisor"},
    "users":         {"owner", "supervisor"},
    "jobcards":      {"owner", "supervisor", "store", "mechanic"},
    "trips":         {"owner", "supervisor", "driver"},
    "triplog":       {"owner", "supervisor", "driver"},
    # Operational stores every role legitimately writes:
    "attendance":    {"owner", "supervisor", "store", "mechanic", "driver", "conductor"},
    "driverreports": {"owner", "supervisor", "store", "mechanic", "driver", "conductor"},
    # Server-ingest only — no client ever pushes these (AirFi → ingest_gps):
    "gpsevents":     set(),
    "gpslive":       set(),
    # Written by the /challans proxy from the upstream response. A client must
    # never be able to push these: forged "no pending challans" rows would hide a
    # real liability, and the data is billable to fetch.
    "challans":      set(),
}

# Stores the server alone writes, from an upstream it controls. Enforced ahead of
# every role check, owner included — see may_write().
SERVER_INGEST_ONLY = {"gpsevents", "gpslive", "challans", "odometerlogs", "waconv"}


def may_write(role, store):
    # Checked before the owner short-circuit: these stores are written only by the
    # server from an upstream source (GPS telemetry, the eChallan proxy). A client
    # push is always forged, and "owner" is not an exemption — a stolen owner
    # session could otherwise file a clean challan record over a real liability,
    # or invent GPS history.
    if store in SERVER_INGEST_ONLY:
        return False
    if role == "owner":
        return True
    allowed = WRITE_ROLES.get(store)
    if allowed is None:
        return False            # unknown store → deny (allow-list)
    return role in allowed


def push(records, actor=None):
    """Apply pushed records. When `actor` (the authenticated user) is given, enforce
    the write matrix and stamp immutable server-truth provenance (_by/_byRole/_org)
    that the client cannot set — so attribution and tenant scope come from the token,
    not the request body. Returns applied + rejected counts so the caller can 403 a
    fully-rejected (single-record) push and let the client quarantine it."""
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        applied = 0
        rejected = 0
        for r in records:
            store, rid = r.get("store"), r.get("id")
            upd = int(r.get("updatedAt") or 0)
            if not store or not rid:
                continue
            if actor and not may_write(actor["role"], store):
                rejected += 1
                continue
            data = r.get("data")
            # Overwrite reserved provenance fields from the TOKEN (never trust the
            # body). _by is the trust anchor the Pilferage Radar / audits read.
            if actor and isinstance(data, dict):
                data["_by"] = actor["id"]
                data["_byRole"] = actor["role"]
                data["_org"] = "mahalaxmi"
            row = c.execute("SELECT updatedAt FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
            if row is None or upd > (row[0] or 0):
                rev = _upsert_record(c, store, rid, data, upd, rev)
                applied += 1
        c.commit()
        c.close()
        return {"ok": True, "applied": applied, "rejected": rejected, "maxRev": rev}


def register_roster(crew=None, default_pin="0000"):
    """Materialize server login accounts (PIN 0000) for every crew (driver/conductor)
    who has none yet, so they can server-authenticate and their writes carry a real,
    attributable identity.

    The roster is normally SENT by the owner device (`crew` = list of {id,name,role}),
    because the bundled seed loads crew with notify=false and never pushes them — so
    the server has no crew records to scan. When `crew` is omitted we fall back to
    any store='users' records that WERE pushed. Only driver/conductor roles are ever
    created (management accounts keep their real PINs). Idempotent: an existing
    account is never touched; tombstones are skipped."""
    with _lock:
        c = db()
        if crew:
            items = [(x.get("id"), x.get("name"), x.get("role")) for x in crew
                     if isinstance(x, dict) and x.get("role") in ("driver", "conductor") and x.get("id")]
        else:
            items = []
            for rid, data in c.execute("SELECT id,data FROM records WHERE store='users'").fetchall():
                try:
                    d = json.loads(data)
                except Exception:
                    continue
                if d.get("_deleted") or d.get("role") not in ("driver", "conductor"):
                    continue
                items.append((rid, d.get("name"), d.get("role")))
        created = 0
        for rid, name, role in items:
            if not rid:
                continue
            if c.execute("SELECT 1 FROM users WHERE id=?", (rid,)).fetchone():
                continue
            salt = uuid.uuid4().hex
            c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                      (rid, name or rid, role, salt, hash_pin(salt, default_pin)))
            created += 1
        c.commit()
        c.close()
    return created


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
    # Fallbacks: a Render Secret File, or the local git-ignored file.
    for p in (os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gps_ingest_token"),
              "/etc/secrets/GPS_INGEST_TOKEN", "/etc/secrets/.gps_ingest_token"):
        try:
            with open(p) as f:
                v = f.read().strip()
                if v:
                    return v
        except Exception:
            pass
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

def _gps_hydrate():
    """Serverless-safe refresh: reload the latest positions from the persisted
    `gpslive` store into LIVE_GPS. On a single long-lived process this is a no-op
    after startup, but on serverless (Vercel) each request may hit a fresh
    container whose in-memory LIVE_GPS is empty — so ingest's delta calc and the
    /gps read endpoints must re-read the source of truth (Turso) every request."""
    try:
        c = db()
        rows = c.execute("SELECT reg,data FROM gpslive").fetchall()
        c.close()
        for reg, data in rows:
            try:
                LIVE_GPS[reg] = json.loads(data)
            except Exception:
                pass
    except Exception:
        pass


def ingest_gps(events):
    _gps_hydrate()           # see prior sample for overspeed/harshbrake/idle deltas
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
    # Persist latest positions so the live map survives a server restart/spin-down.
    if accepted:
        try:
            with _lock:
                c = db(); now2 = now_ms()
                for e in events or []:
                    reg = norm_reg(e.get("vehicleReg") or e.get("deviceId"))
                    if reg and reg in LIVE_GPS:
                        c.execute("INSERT INTO gpslive(reg,data,at) VALUES(?,?,?) ON CONFLICT(reg) "
                                  "DO UPDATE SET data=excluded.data, at=excluded.at",
                                  (reg, json.dumps(LIVE_GPS[reg]), now2))
                c.commit(); c.close()
        except Exception:
            pass
    return {"ok": True, "accepted": accepted, "events": len(new_events)}


def _load_live_gps():
    """Repopulate LIVE_GPS from the persisted store at startup, so a fresh process
    (Render cold start) still shows last-known positions before AirFi pushes again."""
    try:
        c = db()
        rows = c.execute("SELECT reg,data FROM gpslive").fetchall()
        c.close()
        for reg, data in rows:
            try:
                LIVE_GPS[reg] = json.loads(data)
            except Exception:
                pass
        if LIVE_GPS:
            print(f"Loaded {len(LIVE_GPS)} live GPS position(s) from store")
    except Exception as e:
        print("gpslive load skipped:", e)


def save_pushsub(sub, role):
    ep = sub.get("endpoint") if isinstance(sub, dict) else None
    if not ep:
        return False
    with _lock:
        c = db()
        c.execute("INSERT INTO pushsubs(endpoint,sub,role,at) VALUES(?,?,?,?) "
                  "ON CONFLICT(endpoint) DO UPDATE SET sub=excluded.sub, role=excluded.role, at=excluded.at",
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


def save_upload(data_url, host, proto="http"):
    head, _, b64 = data_url.partition(",")
    ext = "png" if "image/png" in head else "jpg"
    ctype = "image/png" if ext == "png" else "image/jpeg"
    name = uuid.uuid4().hex + "." + ext
    raw = base64.b64decode(b64)
    # Cloudflare R2 (free, persistent) when configured — the image lives in object
    # storage and its permanent public URL syncs in the record. Falls back to local
    # disk otherwise (ephemeral on a free host).
    if _USE_R2:
        try:
            _r2_client().put_object(Bucket=R2_BUCKET, Key=name, Body=raw, ContentType=ctype)
            return {"url": f"{R2_PUBLIC_URL}/{name}"}
        except Exception as e:
            print("R2 upload failed, falling back to local disk:", e)
    os.makedirs(UPLOADS, exist_ok=True)
    with open(os.path.join(UPLOADS, name), "wb") as f:
        f.write(raw)
    # Must be HTTPS in production: the PWA is served over HTTPS (GitHub Pages), so
    # an http:// image URL is blocked as mixed content and the photo never shows.
    return {"url": f"{proto}://{host}/uploads/{name}"}


# --------------------------- eChallan lookup -------------------------------
# The upstream returns ~50 fields per challan with three spellings of most of
# them (fine_amount / fine_imposed / amount_of_fine_imposed, service_charge /
# service_charges, created_at / createdAt). Collapse that to the fields the app
# actually shows, and keep the two money figures strictly apart:
#
#   fine     — what is owed to the government. This is the liability.
#   payable  — what eChallan.app bills to settle it through their platform,
#              i.e. fine + their service charge + GST.
#
# A Rs 200 speeding fine comes back as Rs 1,144 payable (Rs 800 service charge +
# Rs 144 GST). Showing the payable figure as "outstanding fines" would overstate
# what the operator owes by ~5x, so both are carried through and labelled.
def _norm_challan(c):
    def num(*keys):
        for k in keys:
            v = c.get(k)
            if v not in (None, ""):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
        return 0.0
    offences = [o.get("name") or o.get("act") or "" for o in (c.get("offence_details") or [])]
    return {
        "challanNo": c.get("challan_no") or c.get("_id"),     # the reconciliation key
        "rc": c.get("rc_no") or c.get("VRN"),
        "date": c.get("challan_date_time") or c.get("original_date_string"),
        "status": c.get("challan_status") or "Unknown",
        "fine": num("fine_imposed", "fine_amount", "amount_of_fine_imposed"),
        "payable": num("total_payable", "total_amount", "display_total"),
        "serviceCharge": num("service_charge", "service_charges"),
        "gst": num("gst_amount"),
        "offence": "; ".join([o for o in offences if o]) or None,
        "place": c.get("challan_place"),
        "state": c.get("state_code"),
        "department": c.get("department"),
        "courtName": c.get("court_name"),
        "sentToCourt": (c.get("sent_to_reg_court") == "Yes") or (c.get("sent_to_virtual_court") == "Yes"),
        "accused": c.get("name_of_violator") or c.get("owner_name"),
        "offlinePayable": bool(c.get("is_offline_payable")),
    }


# --------------------------- Odometer capture ------------------------------
# The problem this solves: every one of the 89 buses carries odometer 0, so
# cost-per-km — the owner's headline maintenance number — has never had anything
# to compute from. Nobody types a reading into an app during a shift. They will
# photograph a dashboard, which is why capture starts from an image and the
# transport (WhatsApp, or the test endpoint) is kept separate from the logic.
#
# Accuracy matters more than coverage here. A misread that turns 45,218 into
# 452,180 silently corrupts cost-per-km for the life of the bus, and nobody would
# notice for months. So every reading is validated against the previous one, an
# implausible jump is held rather than written, and the raw model output is kept
# alongside the number so any figure can be traced back to the photo it came from.

ODO_MAX_DAILY_KM = float(os.environ.get("ODO_MAX_DAILY_KM", "1600"))   # long-haul night runs are ~550 km

# Reading a dashboard is a vision-language job, not OCR: a cluster shows the
# speedometer, trip meter and fuel gauge alongside the odometer, and a plain OCR
# engine returns all of them with no idea which is which. So this needs a model
# that understands "the odometer, not the trip meter" — but it does not need any
# PARTICULAR one, and the cheapest key the operator already has should win.
#
# Three adapters cover essentially every option:
#   anthropic  — Claude
#   gemini     — Google AI Studio keys
#   openai     — anything speaking the OpenAI chat-completions shape, which is
#                OpenAI, OpenRouter, Groq, Together, DeepInfra, and a local
#                Ollama, by pointing VISION_BASE at it
#
# Set VISION_PROVIDER + VISION_KEY + VISION_MODEL. If they are unset the server
# falls back to ANTHROPIC_API_KEY so nothing that already worked stops working.
VISION_PROVIDER = os.environ.get("VISION_PROVIDER", "").strip().lower()
VISION_KEY = os.environ.get("VISION_KEY", "").strip()
VISION_MODEL = os.environ.get("VISION_MODEL", "").strip()
VISION_BASE = os.environ.get("VISION_BASE", "").strip().rstrip("/")

_VISION_DEFAULT_MODEL = {
    "anthropic": "claude-sonnet-5",
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
}


def vision_config():
    """Resolve the provider actually in effect, so /health can report it and the
    operator can see which key is being used without reading the logs."""
    if VISION_PROVIDER and VISION_KEY:
        return VISION_PROVIDER, VISION_KEY, (VISION_MODEL or _VISION_DEFAULT_MODEL.get(VISION_PROVIDER, ""))
    if ANTHROPIC_API_KEY:
        return "anthropic", ANTHROPIC_API_KEY, (VISION_MODEL or _VISION_DEFAULT_MODEL["anthropic"])
    return "", "", ""


# WhatsApp Cloud API. All four are needed for the live transport; without them
# the odometer flow still works through /odometer/submit, which is how the pilot
# is measured before Meta approves the Business account.
WA_TOKEN = os.environ.get("WA_TOKEN", "")               # permanent system-user token
WA_PHONE_ID = os.environ.get("WA_PHONE_ID", "")         # sender phone-number id
WA_VERIFY_TOKEN = os.environ.get("WA_VERIFY_TOKEN", "") # echoed back on webhook setup
WA_APP_SECRET = os.environ.get("WA_APP_SECRET", "")     # validates X-Hub-Signature-256
WA_PROMPT_TEMPLATE = os.environ.get("WA_PROMPT_TEMPLATE", "")   # approved template for out-of-window sends
WA_TEMPLATE_LANG = os.environ.get("WA_TEMPLATE_LANG", "en")


def wa_send(to, text, last_inbound_ms=None):
    """Reply to a driver.

    Branches on the 24-hour service window rather than sending and hoping. Meta
    rejects free-form text outside it, and repeatedly retrying a rejected send is
    what gets a sender's quality rating downgraded — so outside the window this
    falls back to the approved prompt template instead. Ported understanding from
    the Zappie codebase's inbox_policy; the original server sent free-form
    unconditionally, which would have failed silently for any driver who had not
    messaged in a day.
    """
    if not (WA_TOKEN and WA_PHONE_ID):
        return False
    try:
        if last_inbound_ms is None or wa_client.can_send_freeform(last_inbound_ms, now_ms()):
            wa_client.send_text(WA_TOKEN, WA_PHONE_ID, to, text)
        elif WA_PROMPT_TEMPLATE:
            wa_client.send_template(WA_TOKEN, WA_PHONE_ID, to, WA_PROMPT_TEMPLATE, WA_TEMPLATE_LANG)
        else:
            return False
        return True
    except wa_client.WAError:
        return False


def wa_prompt_odometer(to):
    """Business-initiated shift-end prompt. Always a template — by definition the
    driver has not just messaged us, so the window is shut."""
    if not (WA_TOKEN and WA_PHONE_ID and WA_PROMPT_TEMPLATE):
        return False
    try:
        wa_client.send_template(WA_TOKEN, WA_PHONE_ID, to, WA_PROMPT_TEMPLATE, WA_TEMPLATE_LANG)
        return True
    except wa_client.WAError:
        return False


def _wa_last_inbound(phone):
    """When this number last wrote to us, which decides free-form vs template."""
    tail = re.sub(r"\D", "", phone or "")[-10:]
    with _lock:
        c = db()
        row = c.execute("SELECT data FROM records WHERE store='waconv' AND id=?", (tail,)).fetchone()
        c.close()
    if not row:
        return None
    try:
        return json.loads(row[0]).get("lastInboundAt")
    except Exception:
        return None


def _wa_note_inbound(phone, wa_message_id):
    tail = re.sub(r"\D", "", phone or "")[-10:]
    now = now_ms()
    rec = {"id": tail, "phone": tail, "lastInboundAt": now,
           "lastMessageId": wa_message_id, "updatedAt": now}
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "waconv", tail, rec, now, rev)
        c.commit(); c.close()


def _wa_handle(body):
    """Process one webhook delivery off the request thread.

    Async because OCR takes seconds and Meta times the webhook out at 20 — a slow
    reply is retried, and the driver would get the same answer twice.
    """
    try:
        for entry in wa_client.extract_entries(body):
            for raw in entry.get("messages", []):
                msg = wa_client.normalize_message(raw)
                frm = msg.get("from") or ""
                if not frm:
                    continue
                # Record the inbound BEFORE replying: it opens the service window,
                # and the reply itself depends on that window being known open.
                _wa_note_inbound(frm, msg.get("id"))
                if msg.get("id"):
                    wa_client.mark_read(WA_TOKEN, WA_PHONE_ID, msg["id"])
                last = _wa_last_inbound(frm)

                if msg["type"] == "image" and msg.get("media_id"):
                    try:
                        img = wa_client.media_data_url(WA_TOKEN, msg["media_id"])
                    except wa_client.WAError:
                        wa_send(frm, "Photo nahi mila. Dobara bhejein.", last)
                        continue
                    res = odometer_submit(frm, img, source="whatsapp")
                    wa_send(frm, res.get("reply") or "Ho gaya.", last)
                else:
                    wa_send(frm, "Meter ka photo bhejein — bas photo, aur kuch nahi.", last)
    except Exception:
        pass


def bus_by_phone(phone):
    """Find the bus whose crew phone matches. Last 10 digits, so +91/0 prefixes
    and spacing don't matter — crew give their number a different way each time."""
    tail = re.sub(r"\D", "", phone or "")[-10:]
    if len(tail) < 10:
        return None
    with _lock:
        c = db()
        rows = c.execute("SELECT id,data FROM records WHERE store='buses'").fetchall()
        c.close()
    for rid, raw in rows:
        try:
            b = json.loads(raw)
        except Exception:
            continue
        if re.sub(r"\D", "", str(b.get("crewPhone") or ""))[-10:] == tail:
            return b
    return None


ODO_PROMPT = (
    "This is a photo of a bus instrument cluster. Read the ODOMETER — the total "
    "distance travelled, in kilometres. Ignore the trip meter, speedometer, fuel "
    "gauge and any warning lights.\n"
    "Reply with ONLY the digits, no commas, no units, no explanation. "
    "If you cannot read the odometer clearly, reply with exactly: NONE"
)


def _post_json(url, payload, headers, timeout=45):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers=dict(headers, **{"content-type": "application/json"}))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def vision_read_odometer(image_data_url):
    """Read the odometer from a dashboard photo. Returns (km:int|None, raw:str).

    Every adapter asks for a bare number or the literal word NONE. A model that
    hedges in prose ("it looks like around 45,000") yields a number that is not a
    reading, and writing that into the fleet record is worse than capturing
    nothing — so anything that isn't clean digits is treated as unreadable and the
    driver is asked again.
    """
    provider, key, model = vision_config()
    if not provider:
        return None, "no vision provider configured"
    try:
        header, b64 = image_data_url.split(",", 1)
        media = header.split(";")[0].split(":")[1] if ":" in header else "image/jpeg"
    except Exception:
        return None, "bad image"

    try:
        if provider == "anthropic":
            j = _post_json("https://api.anthropic.com/v1/messages", {
                "model": model, "max_tokens": 16,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                    {"type": "text", "text": ODO_PROMPT}]}],
            }, {"x-api-key": key, "anthropic-version": "2023-06-01"})
            text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()

        elif provider == "gemini":
            base = VISION_BASE or "https://generativelanguage.googleapis.com/v1beta"
            # Key goes in the header, not the query string — a URL with a secret in
            # it ends up in proxy and access logs.
            j = _post_json(f"{base}/models/{model}:generateContent", {
                "contents": [{"parts": [
                    {"inline_data": {"mime_type": media, "data": b64}},
                    {"text": ODO_PROMPT}]}],
                "generationConfig": {"maxOutputTokens": 16},
            }, {"x-goog-api-key": key})
            cands = j.get("candidates") or []
            parts = (cands[0].get("content", {}).get("parts") or []) if cands else []
            text = "".join(p.get("text", "") for p in parts).strip()

        elif provider == "openai":
            # Also covers OpenRouter, Groq, Together, DeepInfra and a local Ollama —
            # they all speak this shape; only the base URL and model name change.
            base = VISION_BASE or "https://api.openai.com/v1"
            j = _post_json(f"{base}/chat/completions", {
                "model": model, "max_tokens": 16,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": ODO_PROMPT},
                    {"type": "image_url", "image_url": {"url": image_data_url}}]}],
            }, {"authorization": f"Bearer {key}"})
            text = ((j.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()

        else:
            return None, f"unknown vision provider: {provider}"

    except urllib.error.HTTPError as e:
        # Surface the status — a 429 (out of quota) reads identically to a broken
        # key otherwise, and they need different fixes.
        return None, f"{provider} HTTP {e.code}"
    except Exception:
        return None, f"{provider} unreachable"

    digits = re.sub(r"\D", "", text or "")
    if not digits or "NONE" in (text or "").upper():
        return None, text or "empty response"
    return int(digits), text


def odometer_submit(phone, image_data_url, source="test", dry=False):
    """Core capture path, shared by the WhatsApp webhook and the test endpoint.

    Returns a dict with `status` — one of enrol / unreadable / held / accepted —
    and a `reply` written for a driver to read on a phone, in the register the
    crew actually use rather than app English.

    `dry` runs the read and the validation but writes nothing, so OCR accuracy can
    be measured against real photos without moving the fleet's odometers. The
    whole point of measuring first is to not corrupt the baseline while doing it.
    """
    bus = bus_by_phone(phone)
    if not bus:
        return {"status": "enrol", "reply":
                "Yeh number kisi bus se linked nahi hai. Office se apna number "
                "register karwayein."}

    km, raw = vision_read_odometer(image_data_url)
    if km is None:
        return {"status": "unreadable", "bus": bus.get("regNo"), "raw": raw, "reply":
                "Meter clear nahi dikha. Thoda paas se, seedha photo bhejein."}

    prev = int(bus.get("odometer") or 0)
    now = now_ms()
    log = {
        "id": "odo-" + uuid.uuid4().hex[:12],
        "busId": bus.get("id"), "reg": bus.get("regNo"),
        "km": km, "prevKm": prev, "delta": (km - prev) if prev else None,
        "phone": re.sub(r"\D", "", phone or "")[-10:],
        "raw": raw, "source": source, "at": now, "updatedAt": now,
        "status": "accepted",
    }

    # A reading that goes backwards is either a misread or the wrong bus. Never
    # write it — a decreasing odometer would make every downstream km figure
    # negative and is not recoverable once it has propagated to devices.
    if prev and km < prev:
        log["status"] = "held-backwards"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: {km:,} km pichhli reading ({prev:,} km) se kam hai. "
                "Office check karega. Dobara photo bhej sakte hain."}

    # A jump too large to be one day's running is held for a human rather than
    # written. This is the digit-slip case (45,218 read as 452,180) and it is the
    # one that would quietly poison cost-per-km for months.
    if prev and (km - prev) > ODO_MAX_DAILY_KM:
        log["status"] = "held-jump"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: {km:,} km — pichhli baar se {km - prev:,} km zyada. "
                "Office confirm karega."}

    if dry:
        return {"status": "accepted", "dry": True, "bus": bus.get("regNo"), "km": km,
                "prev": prev, "raw": raw,
                "reply": f"[dry] {bus.get('regNo')}: {km:,} km read, nothing written."}

    bus["odometer"] = km
    bus["odometerAt"] = now
    bus["updatedAt"] = now
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        rev = _upsert_record(c, "buses", bus["id"], bus, now, rev)
        _upsert_record(c, "odometerlogs", log["id"], log, now, rev)
        c.commit(); c.close()

    delta = f" (+{km - prev:,} km)" if prev else ""
    return {"status": "accepted", "bus": bus.get("regNo"), "km": km, "prev": prev,
            "reply": f"{bus.get('regNo')}: {km:,} km darj ho gaya{delta}. Dhanyavaad."}


def _write_odo_log(log):
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "odometerlogs", log["id"], log, log["at"], rev)
        c.commit(); c.close()


def store_challan_snapshot(payload):
    """Write one bus's snapshot into the synced record set, keyed by registration.

    Goes through the same records table every other store uses, so it rides the
    normal /pull to every device with no extra plumbing. Failure here must not
    fail the caller's lookup — they already paid the credit and should still get
    their answer.
    """
    try:
        with _lock:
            c = db()
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "challans", payload["rc"], payload, payload["updatedAt"], rev)
            c.commit(); c.close()
    except Exception:
        pass


def echallan_lookup(rc_no):
    """One upstream challan lookup. Returns (payload, error_tuple_or_None)."""
    rc = re.sub(r"[^A-Za-z0-9]", "", (rc_no or "")).upper()
    if not rc:
        return None, (400, {"error": "rc_no required"})
    url = f"{ECHALLAN_BASE}/vahanfin/echallan?rc_no={urllib.parse.quote(rc)}"
    # The edge in front of this API 403s the default "Python-urllib/3.x" agent.
    # Any ordinary UA passes; without one every lookup fails as Forbidden.
    req = urllib.request.Request(url, headers={
        "X-API-Key": ECHALLAN_API_KEY,
        "User-Agent": "GarageSaathi/1.0 (+https://github.com/Bhuwangarg/garage-saathi)",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            j = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        # 402 is out of credits — worth its own message, it is not a bug.
        if e.code == 402:
            return None, (402, {"error": "eChallan credits exhausted", "rc": rc})
        if e.code in (401, 403):
            return None, (502, {"error": "eChallan rejected the API key", "rc": rc})
        return None, (502, {"error": f"eChallan upstream error {e.code}", "rc": rc})
    except Exception:
        return None, (502, {"error": "eChallan unreachable", "rc": rc})

    rows = [_norm_challan(c) for c in (j.get("challans") or [])]
    pending = [r for r in rows if r["status"] == "Pending"]
    billing = j.get("_billing") or {}
    return {
        "rc": rc,
        # `updatedAt` is what the client's last-write-wins comparison reads. Without
        # it every pulled refresh would compare 0 > 0 and be silently discarded, so
        # a device would keep its first snapshot forever.
        "updatedAt": now_ms(),
        "fetchedAt": now_ms(),
        # A repeat lookup inside their cache window bills 0, and a provider outage
        # bills 0 too — so cost is per-fetch, not per-call. Surfaced so the app can
        # show what a fleet sweep actually spent.
        "creditsUsed": billing.get("cost"),
        "creditsLeft": billing.get("remaining_credits"),
        "providerUnavailable": bool(j.get("provider_unavailable")),
        "total": j.get("total_count", len(rows)),
        "pendingCount": j.get("pending_count", len(pending)),
        "disposedCount": j.get("disposed_count", len(rows) - len(pending)),
        "pendingFine": round(sum(r["fine"] for r in pending), 2),
        "pendingPayable": round(sum(r["payable"] for r in pending), 2),
        "courtCount": sum(1 for r in rows if r["sentToCourt"]),
        "challans": rows,
    }, None


# ------------------------------- HTTP --------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload=None, raw=None, ctype="application/json", cache=None):
        if raw is not None:
            body = raw
        else:
            body = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", cors_origin_for(self.headers.get("Origin")))
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", ctype)
        if cache:
            self.send_header("Cache-Control", cache)
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

    def _raw_body(self):
        """Undecoded bytes — Meta's webhook signature is computed over the exact
        payload, so it cannot be re-serialised from parsed JSON."""
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return self.rfile.read(n) or b""
        except Exception:
            return b""

    def _auth_user(self):
        h = self.headers.get("Authorization") or ""
        token = h[7:] if h.startswith("Bearer ") else ""
        return user_for_token(token)

    def do_OPTIONS(self):
        self._send(204)

    def parse_request(self):
        """Restore the client's original path.

        Vercel rewrites do not pass the requested URL through to the function —
        the handler receives the rewrite DESTINATION. Measured on the live
        deployment: a request for /health arrived as /api/index, and /auth/login
        as /api/index?path=login, so every route except / returned 404 while
        looking perfectly correct from outside.

        vercel.json therefore rewrites to /api/index?__p=<original path>, and this
        puts it back before any routing happens. Any other query parameters the
        client sent are preserved. A direct request (local, Render, Docker) has no
        __p and is left untouched.
        """
        ok = BaseHTTPRequestHandler.parse_request(self)
        if not ok:
            return ok
        try:
            u = urlparse(self.path)
            q = parse_qs(u.query, keep_blank_values=True)
            orig = (q.pop("__p", [""]) or [""])[0]
            if orig.startswith("/"):
                rest = urlencode([(k, v) for k, vs in q.items() for v in vs])
                self.path = orig + ("?" + rest if rest else "")
        except Exception:
            pass                       # never let path rewriting break a request
        return ok

    def handle_one_request(self):
        # The single choke point every request passes through, so serverless cold
        # starts bootstrap exactly like a long-running process does.
        try:
            bootstrap()
        except Exception as e:
            print("bootstrap failed: %s" % e)
        return BaseHTTPRequestHandler.handle_one_request(self)

    def do_GET(self):
        u = urlparse(self.path)
        # "/" is the app when the PWA is bundled with the function, and only falls
        # back to health when it is not (a backend-only deploy). /health is always
        # health, which is what render.yaml's healthCheckPath and the uptime cron use.
        if u.path == "/" and self._serve_static("/index.html"):
            return
        if u.path in ("/", "/health"):
            _gps_hydrate()                                 # accurate live count on serverless (fresh container)
            _turso_live = bool(_USE_TURSO and _TURSO_OK)   # actually connected, not just configured
            # `persistent` must mean "survives a redeploy", which disk-backed SQLite
            # does. Reporting it as False there sent us chasing a data-loss scare
            # that was really just a naming bug.
            # Postgres is durable by definition — if we can answer at all, the
            # connection came up, because _connect() refuses to start without it.
            _db_ok, _db_err = db_probe()
            _persistent = (_USE_PG and _db_ok) or _turso_live or (not _USE_TURSO and _DISK_PERSISTENT)
            _mode = ("postgres" if (_USE_PG and _db_ok) else
                     "postgres-unreachable" if _USE_PG else
                     "turso" if _turso_live else
                     ("sqlite-disk" if _persistent else "sqlite-ephemeral"))
            # diskVerified is the only trustworthy signal: true means data written
            # before a previous restart was still on disk at this boot.
            _verified = None if _turso_live else (_DISK_BOOTS > 1)
            return self._send(200, {"ok": True, "service": "garage-saathi-sync", "db": "turso" if _turso_live else "sqlite",
                                     "dbMode": _mode, "dbPath": None if _turso_live else DB,
                                     "dbOk": _db_ok, "dbError": _db_err,
                                     # Identifies the DEPLOYMENT, not the source. BUILD_TAG only
                                     # moves when code changes, so it cannot tell a redeploy from
                                     # no redeploy — and env values only refresh on a rebuild, so
                                     # that is exactly the question that keeps coming up.
                                     "deployId": os.environ.get("VERCEL_DEPLOYMENT_ID")
                                                 or os.environ.get("VERCEL_URL"),
                                     "commit": (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "")[:7] or None,
                                     "diskVerified": None if _USE_PG else _verified,
                                     "diskBoots": _DISK_BOOTS, "diskError": _DISK_ERROR,
                                     # Host only — never the password, /health is public.
                                     "pgHost": _pg_host(),
                                     "persistent": _persistent, "tursoConfigured": _USE_TURSO, "tursoConnected": _TURSO_OK,
                                     "urlSet": bool(TURSO_URL), "tokenSet": bool(TURSO_TOKEN),
                                     "aiKeySet": bool(ANTHROPIC_API_KEY), "vapidReady": _WEBPUSH and bool(_vapid_pem_path()),
                                     # Two separate facts, because they fail separately and the
                                     # symptom is identical from outside: `build` is the commit
                                     # actually running (auto-deploy is off, so a restart can pick
                                     # up a new env var while still serving old code), and
                                     # echallanKeySet is whether the key reached the process.
                                     "build": BUILD_TAG, "echallanKeySet": bool(ECHALLAN_API_KEY),
                                     # Which key the odometer OCR will actually use. Names the
                                     # provider and model but never the key, so a misconfigured
                                     # switch is visible without dashboard access.
                                     "vision": {"provider": vision_config()[0] or None,
                                                "model": vision_config()[2] or None},
                                     "photos": "r2" if _USE_R2 else "disk", "photosPersistent": _USE_R2,
                                     # Per-var presence (booleans only, no secrets) so a missing/misnamed
                                     # R2 env var can be pinpointed without dashboard access.
                                     "r2Vars": {"R2_ACCOUNT_ID": bool(R2_ACCOUNT_ID), "R2_ACCESS_KEY_ID": bool(R2_ACCESS_KEY),
                                                "R2_SECRET_ACCESS_KEY": bool(R2_SECRET_KEY), "R2_BUCKET": bool(R2_BUCKET),
                                                "R2_PUBLIC_URL": bool(R2_PUBLIC_URL)},
                                     "gpsIngest": _GPS_TOKEN_OK, "gpsLiveRegs": len(LIVE_GPS)})
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
            _gps_hydrate()
            return self._send(200, gps_telemetry(bus_id, odo, reg))
        if u.path == "/push/vapid":                   # public VAPID key for the browser to subscribe
            return self._send(200, {"publicKey": VAPID_PUBLIC, "enabled": _WEBPUSH and bool(_vapid_pem_path()),
                                    "webpush": _WEBPUSH,
                                    "keyEnv": bool(os.environ.get("VAPID_PRIVATE_KEY")),   # is the env var visible to the process?
                                    "secretFile": os.path.exists("/etc/secrets/vapid_private.pem")})
        if u.path == "/gps/latest":                  # provider self-check
            reg = (parse_qs(u.query).get("reg") or [""])[0]
            _gps_hydrate()
            data = LIVE_GPS.get(norm_reg(reg))
            return self._send(200 if data else 404, data or {"error": "no telemetry for reg"})
        if u.path == "/gps/fleet":                    # every registration AirFi has pushed
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            _gps_hydrate()
            buses = [{"reg": v.get("reg") or k, "odometer": v.get("odometer"), "lastPing": v.get("lastPing"),
                      "lat": v.get("lat"), "lng": v.get("lng"), "speedKph": v.get("speedKph"), "ignition": v.get("ignition")}
                     for k, v in LIVE_GPS.items()]
            return self._send(200, {"buses": sorted(buses, key=lambda b: b["reg"])})

        if u.path == "/wa/webhook":
            # Meta's one-time verification handshake: echo hub.challenge back in
            # plain text when the token matches. Anything else must not 200, or the
            # webhook registers against a token we never agreed.
            q = parse_qs(u.query)
            mode = (q.get("hub.mode") or [""])[0]
            token = (q.get("hub.verify_token") or [""])[0]
            challenge = (q.get("hub.challenge") or [""])[0]
            if mode == "subscribe" and WA_VERIFY_TOKEN and token == WA_VERIFY_TOKEN:
                body = challenge.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return self._send(403, {"error": "verification failed"})

        if u.path == "/challans":     # eChallan proxy — keeps the API key OFF devices
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            # Outstanding fines and court referrals are finance data, and each
            # lookup spends a billable credit. Same gate as the money screens.
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            if not ECHALLAN_API_KEY:
                return self._send(501, {"error": "eChallan not configured on server"})
            rc = (parse_qs(u.query).get("rc_no") or [""])[0]
            payload, err = echallan_lookup(rc)
            if err:
                return self._send(err[0], err[1])
            # Persist so the whole fleet's snapshot is fetched once, not once per
            # device. Lookups are billable, and challan liability is something the
            # supervisor needs to see without re-paying for it on their own phone.
            store_challan_snapshot(payload)
            return self._send(200, payload)

        # Echo the path the process actually received. Behind a platform that
        # rewrites URLs (Vercel routes everything to one function) the request the
        # handler sees is not always the one the client sent, and without this the
        # symptom is an unexplainable 404 on a route that demonstrably exists.
        if self._serve_static(u.path):
            return
        self._send(404, {"error": "not found", "sawPath": self.path,
                         "sawMethod": self.command})

    def _serve_static(self, path):
        """Serve a PWA file from the app root. Returns True if it handled it."""
        rel = path.lstrip("/") or "index.html"
        ext = os.path.splitext(rel)[1].lower()
        if ext not in _STATIC_OK:
            return False
        full = os.path.normpath(os.path.join(APP_ROOT, rel))
        # normpath collapses .., so this rejects traversal after resolution
        # rather than trying to spot it in the raw path.
        if not full.startswith(APP_ROOT + os.sep) or not os.path.isfile(full):
            return False
        try:
            with open(full, "rb") as f:
                body = f.read()
        except Exception:
            return False
        # The service worker must never be cached, or a device pins an old app.js
        # forever. Everything else is fine to cache briefly.
        self._send(200, raw=body, ctype=_CTYPES.get(ext, "application/octet-stream"),
                   cache="no-cache" if rel == "sw.js" else "public, max-age=300")
        return True

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

        if u.path == "/odometer/submit":
            # Transport-independent capture. Exists so the whole flow — routing,
            # OCR, validation, write — can be exercised and measured before the
            # WhatsApp Business account is approved, and so it stays testable
            # afterwards without sending real messages to crew.
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            phone = (b.get("phone") or "").strip()
            image = b.get("image") or ""
            if not phone or not image.startswith("data:"):
                return self._send(400, {"error": "phone and image (data URL) required"})
            return self._send(200, odometer_submit(phone, image, source="test",
                                                   dry=bool(b.get("dry"))))

        if u.path == "/wa/webhook":
            # WhatsApp Cloud API delivers inbound messages here. Meta retries on any
            # non-200, so this always answers 200 once the payload is understood —
            # a failed OCR is a conversation to have with the driver, not a delivery
            # failure to make Meta repeat.
            if WA_APP_SECRET:
                raw = self._raw_body()
                if not wa_client.verify_signature(raw, self.headers.get("X-Hub-Signature-256"), WA_APP_SECRET):
                    return self._send(403, {"error": "bad signature"})
                try:
                    b = json.loads(raw or b"{}")
                except Exception:
                    return self._send(200, {"ok": True})
            else:
                b = self._body()
            threading.Thread(target=_wa_handle, args=(b,), daemon=True).start()
            return self._send(200, {"ok": True})

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

        if u.path == "/auth/register-roster":   # materialize crew server accounts (owner/supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            return self._send(200, {"ok": True, "created": register_roster(self._body().get("crew"))})

        if u.path == "/push":
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            res = push(self._body().get("records") or [], me)
            # A push the actor's role may not make → 403 so the client quarantines it
            # (single-record pushes, so applied==0 with rejects means this write was denied).
            if res.get("applied", 0) == 0 and res.get("rejected", 0):
                return self._send(403, dict(res, error="role not permitted to write this record"))
            return self._send(200, res)

        if u.path == "/admin/import":
            # Restore a device backup into a fresh server.
            #
            # This exists because a normal /push CANNOT restore: push() stamps
            # _by/_byRole from the caller's token, so replaying one device's copy
            # of the garage would re-attribute all 2,800 records to whoever ran the
            # restore — destroying the actor trail the Pilferage Radar reads. Here
            # we call push() with actor=None so the provenance already inside the
            # backup is written through unchanged.
            #
            # Because that also bypasses the write matrix, it is gated three ways:
            # owner token, a secret only present in the host's env, and a refusal
            # to write into a database that already holds records.
            me = self._auth_user()
            if not me or me.get("role") != "owner":
                return self._send(403, {"error": "owner only"})
            want = os.environ.get("IMPORT_TOKEN", "")
            if not want or self.headers.get("X-Import-Token") != want:
                return self._send(403, {"error": "IMPORT_TOKEN not set on the server, or header missing/incorrect"})
            b = self._body()
            recs = b.get("records") or []
            if not b.get("force"):
                with _lock:
                    c = db()
                    # Exclude `users`: seed_users()/register_roster write PIN-free
                    # roster rows at every startup, so a genuinely fresh server is
                    # never literally empty. The guard is about operational data.
                    have = c.execute("SELECT COUNT(*) FROM records WHERE store<>'users'").fetchone()[0]
                    c.close()
                if have:
                    return self._send(409, {"error": "database is not empty", "records": have,
                                            "hint": "pass force:true only if you mean to merge into existing data"})
            return self._send(200, push(recs, None))

        if u.path == "/upload":
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            if int(self.headers.get("Content-Length") or 0) > MAX_UPLOAD_BYTES:
                return self._send(413, {"error": f"upload too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)"})
            data = self._body().get("data") or ""
            if not data.startswith("data:"):
                return self._send(400, {"error": "expected data URL"})
            _host = self.headers.get("Host", f"localhost:{PORT}")
            # Behind Render/any TLS proxy the request arrives as https; honor
            # X-Forwarded-Proto, and default to https for any non-local host.
            _proto = (self.headers.get("X-Forwarded-Proto")
                      or ("http" if _host.startswith(("localhost", "127.")) else "https"))
            return self._send(200, save_upload(data, _host, _proto))

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

        if u.path == "/ai/vision":   # Claude vision — part-wear grading + serial OCR
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            if not ANTHROPIC_API_KEY:
                return self._send(501, {"error": "AI not configured on server"})
            b = self._body()
            image = (b.get("image") or "")        # data URL: data:image/jpeg;base64,XXXX
            prompt = (b.get("prompt") or "").strip()
            if not image.startswith("data:") or "," not in image or not prompt:
                return self._send(400, {"error": "image (data URL) and prompt required"})
            try:
                header, b64 = image.split(",", 1)
                media = header.split(";")[0].split(":")[1] if ":" in header else "image/jpeg"
                payload = json.dumps({
                    "model": b.get("model") or "claude-haiku-4-5-20251001",
                    "max_tokens": 300,
                    "messages": [{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                        {"type": "text", "text": prompt},
                    ]}],
                }).encode()
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=payload, method="POST", headers={
                    "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=40) as resp:
                    j = json.loads(resp.read())
                text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()
                return self._send(200, {"text": text})
            except Exception as e:
                return self._send(502, {"error": "AI vision upstream error"})

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

        # Echo the path the process actually received. Behind a platform that
        # rewrites URLs (Vercel routes everything to one function) the request the
        # handler sees is not always the one the client sent, and without this the
        # symptom is an unexplainable 404 on a route that demonstrably exists.
        self._send(404, {"error": "not found", "sawPath": self.path,
                         "sawMethod": self.command})

    def log_message(self, *a):
        pass


# Vercel's Python runtime serves a module-level `BaseHTTPRequestHandler` subclass
# named `handler`. The api/index.py entry re-exports this. On serverless there's
# no long-lived process: schema lives in the shared Turso DB (created already),
# live GPS is re-read per request via _gps_hydrate(), so no startup step is run.
handler = Handler


if __name__ == "__main__":
    try:
        db().close()
    except DatabaseUnavailable as e:
        # Exit non-zero so the platform marks the deploy failed and keeps routing
        # to the previous healthy container, instead of promoting a broken one.
        print("FATAL: " + str(e))
        raise SystemExit(1)
    _record_boot()                   # evidence for /health: did storage survive a restart?
    if not ENABLE_DEMO_SEED:
        print("ENABLE_DEMO_SEED=0 → skipping demo staff accounts (real deployment)")
    bootstrap()                      # same path serverless takes
    os.makedirs(UPLOADS, exist_ok=True)
    if ALLOWED_ORIGINS == "*":
        print("WARNING: ALLOWED_ORIGIN=* (open CORS). Unset it to lock to the PWA domain before production.")
    else:
        print("CORS locked to: " + ", ".join(ALLOWED_ORIGINS) + " (+ any localhost port for dev)")
    if not _GPS_TOKEN_OK:
        print("NOTE: GPS_INGEST_TOKEN not set (or demo) → /gps/ingest is disabled.")
    print(f"AI advisor proxy: {'ENABLED (/ai)' if ANTHROPIC_API_KEY else 'disabled (set ANTHROPIC_API_KEY)'}")
    print(f"DB: {'Turso (libSQL, persistent)' if _USE_TURSO else DB + ' — local SQLite (EPHEMERAL on Render free; set TURSO_URL+TURSO_AUTH_TOKEN to persist)'}")
    print(f"Garage Saathi sync server on http://0.0.0.0:{PORT}  (uploads: {UPLOADS}/)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

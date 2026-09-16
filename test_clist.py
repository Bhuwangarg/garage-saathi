#!/usr/bin/env python3
"""The C-list from the Sep 2026 security audit: sessions, login limits, backups,
static files, third-party code, request limits and push endpoints.

Runs a real server on loopback against a throwaway SQLite file.

    /usr/bin/python3 test_clist.py
"""
import json, os, re, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ.pop("ENABLE_DEMO_SEED", None)
os.environ.pop("TRUSTED_PROXY_HOPS", None)
os.environ.pop("VERCEL", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

PORT = int(os.environ.get("CLIST_PORT", "8839"))
BASE = "http://127.0.0.1:%d" % PORT
fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def http(path, payload=None, token=None, headers=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            try:
                return r.status, json.loads(body or b"{}")
            except Exception:
                return r.status, body
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b"{}")
        except Exception:
            return e.code, body


def make_user(uid, role, pin):
    c = S.db()
    salt = "s-" + uid
    c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
              (uid, uid, role, salt, S.hash_pin(salt, pin)))
    c.commit(); c.close()


def reset_fails():
    c = S.db(); c.execute("DELETE FROM loginfails"); c.commit(); c.close()


def raw_post(path, headers, body=b""):
    s = socket.create_connection(("127.0.0.1", PORT), timeout=10)
    head = "POST %s HTTP/1.1\r\nHost: x\r\n%s\r\n" % (path, "".join("%s: %s\r\n" % kv for kv in headers.items()))
    s.sendall(head.encode() + body)
    s.shutdown(socket.SHUT_WR)
    data = s.recv(200)
    s.close()
    m = re.match(rb"HTTP/1\.\d (\d+)", data)
    return int(m.group(1)) if m else 0


def main():
    from http.server import ThreadingHTTPServer
    S.bootstrap()
    ThreadingHTTPServer.request_queue_size = 128     # let the burst below actually arrive together
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.3)

    print("C38 — a session outliving a PIN change")
    make_user("u-a", "store", "4821")
    tok = S.do_login("u-a", "4821")["token"]
    check("a fresh session works", S.user_for_token(tok) is not None)
    S.set_pin("u-a", "7395")
    check("after the PIN is changed, the old session is refused", S.user_for_token(tok) is None)
    uid, exp = "u-a", int(time.time()) + 3600
    legacy = "%s.%d.%s" % (uid, exp, S._token_sig(uid, exp, None))
    check("an unbound token issued before the change still works until the cutoff",
          S.user_for_token(legacy) is not None if exp <= S.LEGACY_TOKEN_CUTOFF else True)
    exp2 = S.LEGACY_TOKEN_CUTOFF + 3600
    old_time = time.time
    legacy2 = "%s.%d.%s" % (uid, exp2, S._token_sig(uid, exp2, None))
    check("an unbound token expiring after the cutoff is refused", S.user_for_token(legacy2) is None)

    print("C39 — a burst of simultaneous guesses")
    make_user("u-b", "store", "5190")
    reset_fails()
    results = []

    def guess(i):
        st, _ = http("/auth/login", {"userId": "u-b", "pin": "%04d" % (1000 + i)})
        results.append(st)
    ths = [threading.Thread(target=guess, args=(i,)) for i in range(30)]
    [t.start() for t in ths]
    [t.join() for t in ths]
    check("no more than MAX_FAILS guesses are evaluated per window",
          results.count(401) <= S.MAX_FAILS and results.count(429) >= 30 - S.MAX_FAILS)

    print("C40/C41 — the per-address backstop")
    reset_fails()
    for i in range(S.MAX_IP_FAILS):
        http("/auth/login", {"userId": "u-x%03d" % i, "pin": "0101"}, headers={"X-Forwarded-For": "203.0.113.%d" % (i % 250)})
    st, _ = http("/auth/login", {"userId": "u-y", "pin": "0101"}, headers={"X-Forwarded-For": "198.51.100.7"})
    check("a spoofed X-Forwarded-For does not get a fresh address bucket", st == 429)
    reset_fails()
    make_user("u-c", "store", "6284")
    for i in range(S.MAX_IP_FAILS - 2):
        http("/auth/login", {"userId": "u-z%03d" % i, "pin": "0101"})
    st, _ = http("/auth/login", {"userId": "u-c", "pin": "6284"})
    check("a correct login still works under the limit", st == 200)
    # 48 failures, and the good login added nothing: two more reach the limit of 50.
    http("/auth/login", {"userId": "u-z999", "pin": "0101"})
    http("/auth/login", {"userId": "u-z998", "pin": "0101"})
    st, _ = http("/auth/login", {"userId": "u-z997", "pin": "0101"})
    check("...and it does not reset the address's count", st == 429)
    reset_fails()

    print("C42 — cleaned backups keep deletions")
    tmp = tempfile.mkdtemp()
    src, out = os.path.join(tmp, "b.json"), os.path.join(tmp, "c.json")
    json.dump({"app": "garage-saathi", "data": {
        "users": [{"id": "u-gone", "_deleted": True}, {"id": "u-live", "name": "L", "role": "driver"}],
        "drivers": [{"id": "d-gone", "_deleted": True}],
        "parts": [{"id": "p-gone", "_deleted": True}, {"id": "p-live"}]}}, open(src, "w"))
    subprocess.run([sys.executable, os.path.join(HERE, "scripts", "clean-backup.py"), src, "-o", out],
                   capture_output=True, text=True)
    cleaned = json.load(open(out))["data"] if os.path.exists(out) else {}
    check("users and drivers tombstones survive cleaning",
          any(r.get("_deleted") for r in cleaned.get("users", [])) and any(r.get("_deleted") for r in cleaned.get("drivers", [])))
    check("other tombstones are still dropped", all(not r.get("_deleted") for r in cleaned.get("parts", [])))

    print("C43 — files the server will publish")
    probe = os.path.join(HERE, "crew-backup-19990101-000000.json")
    open(probe, "w").write('{"secret": true}')
    try:
        st, _ = http("/crew-backup-19990101-000000.json")
        check("a crew backup in the app folder is not served", st == 404)
    finally:
        os.remove(probe)
    check("no .json is served", http("/assets/parts/CREDITS.json")[0] == 404)
    check("tooling folders are not served", http("/mobile/build-www.mjs")[0] == 404 and http("/scripts/x.html")[0] == 404)
    check("the app itself still is", http("/index.html")[0] == 200 and http("/app.js")[0] == 200)

    print("C44 — third-party code")
    app = open(os.path.join(HERE, "app.js")).read()
    urls = set(re.findall(r"https://(?:cdn\.jsdelivr\.net|unpkg\.com)/[^'\"`\s)]+\.(?:js|css)", app))
    sri = set(re.findall(r"'(https://[^']+)': 'sha384-", app))
    check("every CDN script and stylesheet is version-pinned",
          all(re.search(r"@\d+\.\d+\.\d+/", u) for u in urls) and urls)
    check("every one carries an integrity hash", urls <= sri)
    build = open(os.path.join(HERE, "mobile", "build-www.mjs")).read()
    check("the mobile build checks vendored files by sha256", "VENDOR_SHA256" in build and "hash mismatch" in build)

    print("C45 — request sizes")
    check("a negative Content-Length is refused", raw_post("/auth/login", {"Content-Length": "-1"}) == 413)
    check("an oversized body is refused before it is read",
          raw_post("/auth/login", {"Content-Length": str(S.MAX_REQUEST_BYTES + 1)}) == 413)

    print("C46 — push batch size")
    make_user("u-own", "owner", "8053")
    _, r = http("/auth/login", {"userId": "u-own", "pin": "8053"})
    owner = r.get("token")
    recs = [{"store": "usage", "id": "u%d" % i, "updatedAt": 1, "data": {"id": "u%d" % i}} for i in range(S.MAX_PUSH_RECORDS + 1)]
    st, _ = http("/push", {"records": recs}, owner)
    check("a push over the record cap is refused", st == 413)

    print("C47 — push subscription endpoints")
    keys = {"p256dh": "x", "auth": "y"}
    st, _ = http("/push/subscribe", {"subscription": {"endpoint": "http://127.0.0.1:9/probe", "keys": keys}}, owner)
    check("an internal address is refused", st == 400)
    st, _ = http("/push/subscribe", {"subscription": {"endpoint": "https://169.254.169.254/latest", "keys": keys}}, owner)
    check("a metadata-service address is refused", st == 400)
    st, _ = http("/push/subscribe", {"subscription": {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": keys},
                                     "role": "owner"}, owner)
    check("a real push service is accepted", st == 200)

    srv.shutdown()
    print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

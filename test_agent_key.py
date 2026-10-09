#!/usr/bin/env python3
"""Read-only agent keys: the passenger agent (operator-agents) may read
/gps/latest and /gps/fleet with `Authorization: Agent <key>`, and nothing else.
Removing the key's entry from AGENT_KEYS revokes it at once.

Runs a real server on loopback against a throwaway SQLite file.

    /usr/bin/python3 test_agent_key.py
"""
import contextlib, hashlib, io, json, os, sys, tempfile, threading, time, urllib.error, urllib.request

KEY = "test-agent-key-0123456789"
KEYS = "operator-agents:" + hashlib.sha256(KEY.encode()).hexdigest()
os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["AGENT_KEYS"] = KEYS
os.environ.pop("ENABLE_DEMO_SEED", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

PORT = int(os.environ.get("AGENT_KEY_PORT", "8839"))
BASE = "http://127.0.0.1:%d" % PORT
fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def get(path, auth=None):
    req = urllib.request.Request(BASE + path)
    if auth:
        req.add_header("Authorization", auth)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            return r.status, json.loads(body or b"{}")
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b"{}")
        except ValueError:
            return e.code, {}


def main():
    from http.server import ThreadingHTTPServer
    S.bootstrap()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.3)
    S.ingest_gps([{"deviceId": "AIRFI-000306", "vehicleReg": "RJ14 PF 0306", "lat": 26.91, "lng": 75.79,
                   "speedKph": 42, "ignition": True, "odometerKm": 184321}])
    agent = "Agent " + KEY

    print("The agent key reads the two GPS endpoints")
    st, d = get("/gps/latest?reg=RJ14PF0306", agent)
    check("/gps/latest answers the agent", st == 200 and "RJ14" in json.dumps(d))
    st, d = get("/gps/fleet", agent)
    check("/gps/fleet answers the agent", st == 200 and any("RJ14" in json.dumps(b) for b in d.get("buses", [])))

    print("Anything else is refused")
    check("a wrong agent key is refused", get("/gps/fleet", "Agent not-the-key")[0] == 401)
    check("the key sent as a Bearer session is refused", get("/gps/fleet", "Bearer " + KEY)[0] == 401)
    check("no header is refused", get("/gps/latest?reg=RJ14PF0306")[0] == 401)
    check("the agent key cannot /pull", get("/pull?since=0", agent)[0] == 401)
    st, d = get("/roster", agent)
    check("the agent never appears in /roster", st == 200 and "operator-agents" not in json.dumps(d))

    print("Agent requests are logged by name")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        get("/gps/latest?reg=RJ14PF0306", agent)
        time.sleep(0.1)
    check("the log line names agent:operator-agents", "agent:operator-agents" in buf.getvalue())

    print("Revoking is removing the entry")
    os.environ["AGENT_KEYS"] = ""
    check("a removed key is refused at once", get("/gps/latest?reg=RJ14PF0306", agent)[0] == 401)
    os.environ["AGENT_KEYS"] = KEYS

    srv.shutdown()
    print("\n%d failed" % len(fails) if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

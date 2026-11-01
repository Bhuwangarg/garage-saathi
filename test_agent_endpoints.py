#!/usr/bin/env python3
"""Agent scopes: AGENT_SCOPES decides which routes a read-only agent key opens.

An agent key (AGENT_KEYS) has always opened /gps/latest and /gps/fleet. Scopes
widen and narrow that per agent: `gps` keeps those two, and `crew`, `coaching`
and `papers` open the /agent/* routes. An agent that AGENT_SCOPES does not list,
or no AGENT_SCOPES at all, holds `gps` only, so nothing that worked stops working.

Runs a real server on loopback against a throwaway SQLite file.

    /usr/bin/python3 test_agent_endpoints.py
"""
import contextlib, hashlib, io, json, os, sys, tempfile, threading, time, urllib.error, urllib.request

KEY = "test-agent-key-0123456789"
KEYS = "operator-agents:" + hashlib.sha256(KEY.encode()).hexdigest()
PROVIDER = "test-provider-token-0123456789"
os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["AGENT_KEYS"] = KEYS
os.environ["GPS_INGEST_TOKEN"] = PROVIDER
os.environ.pop("ENABLE_DEMO_SEED", None)
os.environ.pop("AGENT_SCOPES", None)
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

PORT = int(os.environ.get("AGENT_ENDPOINTS_PORT", "8841"))
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


def scopes_of(value, name="operator-agents"):
    """What `name` holds when AGENT_SCOPES is set to `value`."""
    os.environ["AGENT_SCOPES"] = value
    return S.agent_scopes(name)


def main():
    from http.server import ThreadingHTTPServer
    S.bootstrap()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.3)
    S.ingest_gps([{"deviceId": "AIRFI-000306", "vehicleReg": "RJ14 PF 0306", "lat": 26.91, "lng": 75.79,
                   "speedKph": 42, "ignition": True, "odometerKm": 184321}])
    agent = "Agent " + KEY
    office = S.create_user("Office Owner", "owner", "4821")
    session = "Bearer " + S.do_login(office["id"], "4821")["token"]
    provider = "Bearer " + PROVIDER

    print("Scopes")
    os.environ.pop("AGENT_SCOPES", None)
    check("no AGENT_SCOPES: gps still answers", get("/gps/fleet", agent)[0] == 200)
    check("no AGENT_SCOPES: crew is refused with 403", get("/agent/crew", agent)[0] == 403)
    os.environ["AGENT_SCOPES"] = "operator-agents:crew"
    check("gps withdrawn by scope is refused", get("/gps/fleet", agent)[0] == 403)
    os.environ["AGENT_SCOPES"] = "someone-else:gps,crew"
    check("an agent missing from AGENT_SCOPES keeps gps only", get("/gps/fleet", agent)[0] == 200
          and get("/agent/crew", agent)[0] == 403)
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"
    check("no key is 401", get("/agent/crew")[0] == 401)
    check("a wrong key is 401", get("/agent/crew", "Agent nope")[0] == 401)

    print("Withdrawing gps closes both GPS routes")
    os.environ["AGENT_SCOPES"] = "operator-agents:crew"
    st, d = get("/gps/fleet", agent)
    check("/gps/fleet says forbidden and shows no buses", st == 403 and d == {"error": "forbidden"})
    st, d = get("/gps/latest?reg=RJ14PF0306", agent)
    check("/gps/latest says forbidden and shows no position", st == 403 and d == {"error": "forbidden"})
    os.environ["AGENT_SCOPES"] = "operator-agents:gps"
    check("granting gps again opens both at once", get("/gps/fleet", agent)[0] == 200
          and get("/gps/latest?reg=RJ14PF0306", agent)[0] == 200)
    check("gps alone does not open crew", get("/agent/crew", agent)[0] == 403)

    print("The provider and a signed-in user keep /gps/*, whatever the agent holds")
    os.environ["AGENT_SCOPES"] = "operator-agents:crew"          # gps is withdrawn from the agent
    check("the provider token still reads /gps/latest", get("/gps/latest?reg=RJ14PF0306", provider)[0] == 200)
    check("a signed-in user still reads /gps/fleet", get("/gps/fleet", session)[0] == 200)
    check("a signed-in user still reads /gps/latest", get("/gps/latest?reg=RJ14PF0306", session)[0] == 200)

    print("Only an agent's key opens /agent/*")
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"
    check("a signed-in user is not an agent", get("/agent/crew", session)[0] == 401)
    check("the provider token is not an agent", get("/agent/crew", provider)[0] == 401)
    check("the agent key sent as a Bearer session is refused", get("/agent/crew", "Bearer " + KEY)[0] == 401)
    check("without a key every /agent/ path is 401, a route or not", get("/agent/nope")[0] == 401)
    check("a path that is not a route is not served, even to an agent holding every scope",
          get("/agent/nope", agent)[0] in (403, 404))
    os.environ["AGENT_KEYS"] = ""
    check("a removed key is refused at once, scopes or not", get("/agent/crew", agent)[0] == 401)
    os.environ["AGENT_KEYS"] = KEYS

    print("AGENT_SCOPES is read the way it is written")
    os.environ.pop("AGENT_SCOPES", None)
    check("no AGENT_SCOPES: gps only", S.agent_scopes("operator-agents") == {"gps"})
    check("an unlisted agent: gps only", scopes_of("someone-else:crew") == {"gps"})
    check("scopes split on commas", scopes_of("operator-agents:gps,crew,papers") == {"gps", "crew", "papers"})
    check("agents split on semicolons, each with its own scopes",
          scopes_of("someone-else:gps;operator-agents:crew,coaching") == {"crew", "coaching"}
          and S.agent_scopes("someone-else") == {"gps"})
    check("spaces around names and scopes do not matter",
          scopes_of(" someone-else : gps ; operator-agents : crew , papers ") == {"crew", "papers"})
    check("an unknown scope name is dropped", scopes_of("operator-agents:gps,telepathy") == {"gps"})
    check("a listed agent holds only what it lists", scopes_of("operator-agents:telepathy") == set()
          and scopes_of("operator-agents:") == set())
    check("each call reads the variable again", scopes_of("operator-agents:crew") == {"crew"}
          and scopes_of("operator-agents:papers") == {"papers"})

    print("agent_with_scope says who was let in, or why not")
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew"
    check("a held scope is (name, None)", S.agent_with_scope(agent, "crew") == ("operator-agents", None))
    check("a scope not held is (name, 403)", S.agent_with_scope(agent, "coaching") == ("operator-agents", 403))
    check("a scope that does not exist is never held", S.agent_with_scope(agent, "telepathy") == ("operator-agents", 403)
          and S.agent_with_scope(agent, None) == ("operator-agents", 403))
    check("no valid agent key is (None, 401)", S.agent_with_scope("Agent nope", "crew") == (None, 401)
          and S.agent_with_scope("Bearer " + KEY, "crew") == (None, 401) and S.agent_with_scope("", "crew") == (None, 401))

    print("Agent requests are logged by name")
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew"
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        get("/agent/crew", agent)
        get("/agent/coaching", agent)               # refused, but it was still an agent's request
        get("/gps/fleet", agent)
        get("/agent/crew")                          # no key: nobody to name
        time.sleep(0.1)
    log = buf.getvalue()
    check("an /agent/ request is logged as [agent] agent:<name> <path>",
          "[agent] agent:operator-agents /agent/crew" in log)
    check("a refused /agent/ request is logged too", "[agent] agent:operator-agents /agent/coaching" in log)
    check("a GPS request keeps its [gps] line", "[gps] agent:operator-agents /gps/fleet" in log)
    check("one line per keyed request, none for the request without a key",
          log.count("agent:operator-agents") == 3)

    # Every scope again: the sections that test the /agent/ routes start from here.
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"

    srv.shutdown()
    print("\n%d failed" % len(fails) if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

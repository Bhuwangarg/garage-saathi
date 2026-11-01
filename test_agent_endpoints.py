#!/usr/bin/env python3
"""Agent scopes: AGENT_SCOPES decides which routes a read-only agent key opens.

An agent key (AGENT_KEYS) has always opened /gps/latest and /gps/fleet. Scopes
widen and narrow that per agent: `gps` keeps those two, and `crew`, `coaching`
and `papers` open the /agent/* routes. An agent that AGENT_SCOPES does not list,
or no AGENT_SCOPES at all, holds `gps` only, so nothing that worked stops working.

Runs a real server on loopback against a throwaway SQLite file, on a port the OS
picks (the pre-deploy gate takes 8800-8919, so a fixed one here can collide with a
gate run in another session). AGENT_ENDPOINTS_PORT pins one.

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

PORT = int(os.environ.get("AGENT_ENDPOINTS_PORT", "0"))    # 0: the OS picks a free port
BASE = ""                                                  # set once the server is listening
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


def seed(store, records):
    """Write {id: fields} into `store` the way the server does: under its lock, through
    S._upsert_record, which stamps updatedAt. Each record carries its own id, as pushed ones do."""
    with S._lock:
        c = S.db()
        try:
            for rid, fields in records.items():
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                S._upsert_record(c, store, rid, dict(fields, id=rid), S.now_ms(), rev)
            c.commit()
        finally:
            c.close()


def main():
    global BASE
    from http.server import ThreadingHTTPServer
    S.bootstrap()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S.Handler)
    BASE = "http://127.0.0.1:%d" % srv.server_address[1]
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

    print("Each scope opens its own route, and no other")
    routes = (("/agent/crew", "crew"), ("/agent/coaching", "coaching"), ("/agent/bus-papers", "papers"))
    for route, scope in routes:
        os.environ["AGENT_SCOPES"] = "operator-agents:" + scope
        seen = dict((r, get(r, agent)[0]) for r, _ in routes)
        check("holding %s gets past the gate to %s, and to no other /agent/ route" % (scope, route),
              seen[route] not in (401, 403) and all(seen[r] == 403 for r, _ in routes if r != route))

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
    st, d = get("/agent/nope", agent)
    check("a path that is not a route is refused at the gate, even to an agent holding every scope",
          st == 403 and d == {"error": "forbidden"})
    os.environ["AGENT_SCOPES"] = "operator-agents:gps"
    st, d = get("/agent/nope", agent)
    check("a path that is not a route is refused at the gate for a gps-only agent too",
          st == 403 and d == {"error": "forbidden"})
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"
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
    check("a bare listed name holds no scopes", scopes_of("operator-agents") == set())
    check("an agent listed twice holds what its last entry says",
          scopes_of("operator-agents:gps;operator-agents:crew") == {"crew"})
    check("an entry with no colon names nobody, so the agent reads as unlisted and keeps gps",
          scopes_of("operator-agents=gps") == {"gps"})
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
        get("/gps/latest?reg=RJ14PF0306", agent)
        os.environ["AGENT_SCOPES"] = "operator-agents:crew"      # gps withdrawn: both are refused
        get("/gps/fleet", agent)                    # refused with 403, but it was still an agent's request
        get("/gps/latest?reg=RJ14PF0306", agent)
        os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew"
        get("/agent/crew")                          # no key: nobody to name
        get("/agent/crew", "Bearer " + KEY)         # the real key in the wrong place: refused, not logged
        time.sleep(0.1)
    log = buf.getvalue()
    check("an /agent/ request is logged as [agent] agent:<name> <path>",
          "[agent] agent:operator-agents /agent/crew" in log)
    check("a refused /agent/ request is logged too", "[agent] agent:operator-agents /agent/coaching" in log)
    check("a GPS request keeps its [gps] line", "[gps] agent:operator-agents /gps/fleet" in log
          and "[gps] agent:operator-agents /gps/latest" in log)
    check("a GPS request refused because gps was withdrawn is logged too",
          log.count("[gps] agent:operator-agents /gps/fleet") == 2
          and log.count("[gps] agent:operator-agents /gps/latest") == 2)
    check("one line per keyed request, none for the requests without a valid key",
          log.count("agent:operator-agents") == 6)
    check("neither the key nor its digest ever reaches the log",
          KEY not in log and hashlib.sha256(KEY.encode()).hexdigest() not in log)

    # Every scope again: the sections that test the /agent/ routes start from here.
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"

    print("Crew")
    # What the office keeps about a person, and what an agent must never be given.
    private = {"aadhaar": "234567891234", "altPhone": "9000000001", "address": "12 Private Lane, Jaipur",
               "dob": 631152000000, "bloodGroup": "AB-", "license": "RJ14 2019 0007777", "salaryMonthly": 87654321,
               "emgPhone": "9000000002", "photo": "data:image/jpeg;base64,FACE-SENTINEL"}
    people_leaks = [str(v) for v in private.values()] + [
        "u-secret-login", "DOC-SENTINEL",                  # the login id and a document's number and photo
        "9000000003", "9000000005", "9000000006"]          # phones of the three who are not on the list
    seed("buses", {
        "b1": {"regNo": "MP44ZD471"},                        # written the short way, as the office does
        "b-gone": {"regNo": "HR55AB1234", "_deleted": True},  # a bus the office deleted
    })
    seed("drivers", {
        # Their ids and their names sort differently, so an answer in storage order is not sorted by name.
        "d1": dict(private, name="Mohan Lal", busId="b1", phone="+91 98290-12345", userId="u-secret-login",
                   docs={"aadhaar": {"number": "234567891234", "photo": "data:image/jpeg;base64,DOC-SENTINEL"}}),
        "d2": {"name": "Sita Devi", "crewRole": "conductor", "status": "active", "busId": "b1",
               "phone": "09829012345"},
        "d3": {"name": "Left Man", "status": "left", "busId": "b1", "phone": "9000000003", "leftAt": 1},
        # No status (the seeded records have none), no phone, and a bus that was deleted.
        "d4": {"name": "Dinesh Jat", "busId": "b-gone"},
        "d5": {"name": "Archived Man", "status": "archived", "phone": "9000000005"},
        "d6": {"name": "Deleted Dev", "status": "active", "phone": "9000000006", "_deleted": True},
    })
    st, d = get("/agent/crew", agent)
    crew = d.get("crew") or []
    names = sorted(c["name"] for c in crew)
    check("crew lists active crew only", st == 200 and "Left Man" not in names and len(names) == 3)
    check("a conductor is a conductor", any(c["role"] == "conductor" for c in crew))
    check("busReg is the padded plate", any(c["busReg"] == "MP44ZD0471" for c in crew))
    check("a crew member on a deleted bus has no busReg", any(c["busReg"] is None for c in crew))
    check("crew carries the least fields",
          bool(crew) and all(set(c) == {"id", "name", "role", "phone", "busReg"} for c in crew))
    check("the list is the three active people, by name, with phones as the office wrote them", crew == [
        {"id": "d4", "name": "Dinesh Jat", "role": "driver", "phone": "", "busReg": None},
        {"id": "d1", "name": "Mohan Lal", "role": "driver", "phone": "+91 98290-12345", "busReg": "MP44ZD0471"},
        {"id": "d2", "name": "Sita Devi", "role": "conductor", "phone": "09829012345", "busReg": "MP44ZD0471"}])
    check("someone who left, was archived or was deleted is not listed",
          st == 200 and not {"Left Man", "Archived Man", "Deleted Dev"} & set(names))
    check("the plate of a deleted bus is nowhere in the answer", st == 200 and "HR55AB1234" not in json.dumps(d))
    check("nothing the office keeps private appears anywhere in the answer",
          st == 200 and bool(crew) and not [s for s in people_leaks if s in json.dumps(d)])

    print("Coaching")
    hindi = {"good": "आपने इस हफ्ते समय पर गाड़ी निकाली", "fix": "घाट पर ब्रेक धीरे लगाएं",
             "tip": "हर फेरे से पहले गेट चेक करें"}
    first_try = {"good": "यात्रियों से नरमी से बात की", "fix": "कंबल समय पर दें", "tip": "बर्थ पर मदद करें"}

    def three(text):
        return {"good": text, "fix": text, "tip": text}

    base = {"crewId": "d1", "role": "driver", "model": "claude-opus-5-5", "at": 1,
            "facts": {"reviews": 3, "note": "FACTS-SENTINEL"},
            "en": {"good": "EN-GOOD-SENTINEL", "fix": "EN-FIX-SENTINEL", "tip": "EN-TIP-SENTINEL"}}
    seed("coachai", {
        # The ids put the 5000 note before the 1000 note, so an answer in storage order is the wrong way round.
        "co-2026-10-19-d1": dict(base, week="2026-10-19", status="approved", decidedBy="u-secret-decider",
                                 decidedAt=5000, aiHi=three("AIHI-SENTINEL"),
                                 hi=dict(hindi, extra="HI-EXTRA-SENTINEL")),    # only good, fix and tip may leave
        "co-2026-10-26-d1": dict(base, week="2026-10-26", status="approved", decidedBy="u-secret-decider",
                                 decidedAt=1000, hi=first_try),
        "co-2026-10-26-d2": dict(base, crewId="d2", week="2026-10-26", status="draft", hi=three("DRAFT-SENTINEL")),
        # Skipped later than both approvals: only its status keeps it out.
        "co-2026-10-26-d4": dict(base, crewId="d4", week="2026-10-26", status="skipped", decidedBy="u-secret-decider",
                                 decidedAt=7000, hi=three("SKIPPED-SENTINEL")),
    })
    note_leaks = ["EN-GOOD-SENTINEL", "EN-FIX-SENTINEL", "EN-TIP-SENTINEL", "FACTS-SENTINEL", "claude-opus-5-5",
                  "u-secret-decider", "AIHI-SENTINEL", "DRAFT-SENTINEL", "SKIPPED-SENTINEL", "HI-EXTRA-SENTINEL"]

    def notes_since(query=""):
        return get("/agent/coaching" + query, agent)[1].get("notes") or []

    st, d = get("/agent/coaching?approvedSince=2000", agent)
    notes = d.get("notes") or []
    check("coaching returns approved notes since the cursor", st == 200 and [n["decidedAt"] for n in notes] == [5000])
    check("coaching carries the least fields",
          bool(notes) and set(notes[0]) == {"id", "crewId", "week", "hi", "decidedAt"}
          and set(notes[0]["hi"]) == {"good", "fix", "tip"})
    check("drafts and skipped notes never leave", len(notes_since()) == 2)
    check("the oldest decision comes first, with the lines the manager approved", notes_since() == [
        {"id": "co-2026-10-26-d1", "crewId": "d1", "week": "2026-10-26", "hi": first_try, "decidedAt": 1000},
        {"id": "co-2026-10-19-d1", "crewId": "d1", "week": "2026-10-19", "hi": hindi, "decidedAt": 5000}])
    check("nothing but the approved lines leaves: no facts, English, first draft, decider or model",
          bool(notes_since()) and not [s for s in note_leaks if s in json.dumps(notes_since(), ensure_ascii=False)])
    check("the cursor includes the note decided at that very moment",
          [n["decidedAt"] for n in notes_since("?approvedSince=5000")] == [5000]
          and notes_since("?approvedSince=5001") == [])
    check("a missing or non-numeric approvedSince means 0",
          all(len(notes_since(q)) == 2 for q in ("", "?approvedSince=", "?approvedSince=soon", "?approvedSince=-1")))

    # The manager edits the 1000 note and approves it again; the clock reads 9000 for that moment.
    real_now = S.now_ms
    S.now_ms = lambda: 9000
    try:
        done = S.coach_decide({"id": "u-manager", "role": "crewmanager"},
                              {"id": "co-2026-10-26-d1", "decision": "approve", "hi": {"good": "EDITED-SENTINEL"}})
    finally:
        S.now_ms = real_now
    again = notes_since("?approvedSince=6000")
    check("a re-approved note comes back with its new decidedAt",
          done[0] == 200 and [n["decidedAt"] for n in again] == [9000])
    check("it comes back with the line the manager edited, not the one Claude wrote",
          bool(again) and again[0]["hi"] == dict(first_try, good="EDITED-SENTINEL")
          and first_try["good"] not in json.dumps(notes_since(), ensure_ascii=False))
    check("a re-approved note is still one note",
          [n["id"] for n in notes_since()] == ["co-2026-10-19-d1", "co-2026-10-26-d1"])

    # 205 more approved notes, decided from 100000 on: a page is the oldest 200, and the cursor goes on from there.
    seed("coachai", {"co-cap-%03d" % i: dict(base, week="2026-11-02", status="approved", hi=hindi,
                                             decidedAt=100000 + i) for i in range(205)})
    page = notes_since("?approvedSince=100000")
    check("at most 200 notes, the oldest decisions first",
          len(page) == 200 and page[0]["decidedAt"] == 100000 and page[-1]["decidedAt"] == 100199)
    rest = notes_since("?approvedSince=%d" % page[-1]["decidedAt"]) if page else []
    check("the cursor walks on from the last note of a full page",
          [n["decidedAt"] for n in rest] == list(range(100199, 100205)))

    os.environ["AGENT_SCOPES"] = "operator-agents:gps,papers"
    (st_crew, body_crew), (st_notes, body_notes) = get("/agent/crew", agent), get("/agent/coaching", agent)
    check("crew and coaching need their scopes", st_crew == 403 and st_notes == 403)
    check("a refusal gives away neither crew nor notes", body_crew == body_notes == {"error": "forbidden"})
    os.environ["AGENT_SCOPES"] = "operator-agents:gps,crew,coaching,papers"

    print("A served route logs its one line, and nothing about the people")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        get("/agent/crew", agent)
        get("/agent/coaching?approvedSince=1", agent)
        time.sleep(0.1)
    check("each route prints one [agent] line and nothing else", buf.getvalue().splitlines() == [
        "[agent] agent:operator-agents /agent/crew", "[agent] agent:operator-agents /agent/coaching"])

    srv.shutdown()
    print("\n%d failed" % len(fails) if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

"""crew_trace.py must trace a review to the same bus and crew as trace.js does in the app.

Builds random fleets, duty logs, gate checks, redPro assignments, ITS matches and confirmed
names, resolves every review in both (node runs trace.js/duty.js in IST, as the phones do),
and compares bus, confidence and crew with how each was found.

Run: python3 test_crew_trace.py
"""
import json
import os
import random
import subprocess
import tempfile

import crew_trace as CT

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


H = 3600 * 1000
D = 24 * H
BASE = CT.parse_local("2026-10-01 00:00")


def world(seed):
    R = random.Random(seed)
    buses = [{"id": "b%d" % i, "regNo": "MP44ZD%d" % (100 + i) if i % 2 else "RJ 09 PA %04d" % (6100 + i)} for i in range(8)]
    crew = [{"id": "d%d" % i, "role": "driver"} for i in range(10)] + [{"id": "c%d" % i, "role": "conductor"} for i in range(5)]
    dutylog = []
    for m in crew:
        t = BASE - 3 * D
        for k in range(R.randint(1, 4)):
            bus = R.choice(buses + [None])
            dutylog.append({"id": "dl-%s-%d" % (m["id"], k), "at": t, "crewId": m["id"], "role": m["role"],
                            "busId": bus["id"] if bus else None})
            t += R.randint(1, 6) * D + R.randint(0, 23) * H
    services = [{"id": str(500 + s), "routeIds": [str(9000 + s * 10 + r) for r in range(3)],
                 "startTime": R.choice(["18:30", "21:00", "06:15", "", "23:45"])} for s in range(6)]
    gatechecks, assign, its, alias, reviews = [], [], [], [], []
    for n in range(60):
        svc = R.choice(services)
        dep_day = BASE + R.randint(0, 14) * D
        hhmm = svc["startTime"] or "20:00"
        dep = dep_day + int(hhmm[:2]) * H + int(hhmm[3:]) * 60000
        bus = R.choice(buses)
        if R.random() < 0.4:
            gatechecks.append({"id": "gc%d" % n, "serviceId": svc["id"], "startedAt": dep - R.randint(0, 5) * H,
                               "busId": bus["id"], "regNo": bus["regNo"], "driverId": R.choice(crew[:10])["id"],
                               "_deleted": R.random() < 0.05})
        if R.random() < 0.5:
            vb = bus if R.random() < 0.8 else R.choice(buses)
            name = R.choice(["Kesar Dvr", "Jitu Ji", "Mukesh", ""])
            assign.append({"id": "as%d" % n, "serviceId": svc["id"], "date": CT.day_key(dep),
                           "obs": [{"at": dep - R.randint(0, 10) * H, "vehicleNo": vb["regNo"].replace(" ", ""),
                                    "driver1": name, "driver2": "", "cro": R.choice(["Ramu", ""])}]})
            if name and R.random() < 0.6:
                alias.append({"id": CT.alias_id(name, vb["regNo"]), "status": "crew", "crewId": R.choice(crew[:10])["id"]})
        board = dep + R.randint(0, 20) * H + R.randint(0, 59) * 60000
        pnr = str(7000000 + n)
        if R.random() < 0.4:
            jt = CT._ist(dep)
            h12 = jt.hour % 12 or 12
            its.append({"id": "it-" + pnr, "pnr": pnr, "found": True, "crewId": R.choice(crew[:10])["id"],
                        "journeyDate": jt.strftime("%d-%m-%Y"),
                        "startTime": "%02d:%02d %s" % (h12, jt.minute, "PM" if jt.hour >= 12 else "AM")})
        bt = CT._ist(board)
        reviews.append({"id": "rv-%d" % n, "pnr": pnr, "stars": R.randint(1, 5),
                        "routeId": R.choice(svc["routeIds"] + ["unknown"]), "boardAt": bt.strftime("%Y-%m-%d %H:%M:%S")})
    return dict(buses=buses, dutylog=dutylog, services=services, gatechecks=gatechecks, assign=assign,
                itslookup=its, rbalias=alias, reviews=reviews)


NODE = r"""
const T = require('./trace.js'), Duty = require('./duty.js');
const w = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const log = w.dutylog;
function itsTripTime(r) {   // app.js itsTripTime
  const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(r.journeyDate || ''); if (!d) return null;
  const tm = /^(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(r.startTime || '');
  let h = tm ? +tm[1] : 0; const m = tm ? +tm[2] : 0;
  if (tm && tm[3]) { const pm = tm[3].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return new Date(+d[3], +d[2] - 1, +d[1], h, m).getTime();
}
const its = {};   // app.js itsLookups
for (const r of w.itslookup) {
  if (!r.found || !r.crewId) continue;
  const at = itsTripTime(r); let regNo = '';
  if (at != null) { const st = Duty.stateAt(log, at).get(r.crewId); const bus = st && st.busId ? w.buses.find((b) => b.id === st.busId) : null; regNo = bus ? bus.regNo : ''; }
  its[r.pnr] = { crewId: r.crewId, regNo, at };
}
const am = new Map(w.rbalias.filter((a) => a.status === 'crew' && a.crewId).map((a) => [a.id, a.crewId]));
const ctx = { services: w.services, routeIx: T.routeIndex(w.services), gatechecks: w.gatechecks, assign: w.assign, buses: w.buses, its,
  crewAt: (busId, at) => ['driver', 'conductor'].flatMap((role) => Duty.seatHoldersDuring(log, busId, role, at, at + 1).map((x) => ({ crewId: x.crewId, role }))),
  aliasCrew: (name, reg) => am.get(T.aliasId(name, reg)) || null };
const out = {};
for (const r of w.reviews) {
  const tr = T.resolve({ pnr: r.pnr, routeId: r.routeId, boardAt: T.parseLocal(r.boardAt) }, ctx);
  out[r.id] = { conf: tr.confidence, reg: tr.bus ? T.normReg(tr.bus.regNo) : null,
    crew: tr.crew.map((c) => [c.crewId, c.role, [...c.vias].sort().join('+')]).sort() };
}
console.log(JSON.stringify(out));
"""

here = os.path.dirname(os.path.abspath(__file__))
total = same = 0
mismatch = []
for seed in range(40):
    w = world(seed)
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(w, f)
    f.close()
    js = json.loads(subprocess.check_output(["node", "-e", NODE, f.name], cwd=here,
                                            env=dict(os.environ, TZ="Asia/Kolkata")).decode())
    os.unlink(f.name)
    ctx = CT.Context(w["services"], w["gatechecks"], w["assign"], w["buses"], w["dutylog"], w["itslookup"], w["rbalias"])
    for r in w["reviews"]:
        tr = CT.resolve({"pnr": r["pnr"], "routeId": r["routeId"], "boardAt": CT.parse_local(r["boardAt"])}, ctx)
        py = {"conf": tr["confidence"], "reg": CT.norm_reg(tr["bus"]["regNo"]) if tr["bus"] else None,
              "crew": sorted([c["crewId"], c["role"], "+".join(sorted(c["vias"]))] for c in tr["crew"])}
        total += 1
        if py == js[r["id"]]:
            same += 1
        elif len(mismatch) < 3:
            mismatch.append((seed, r["id"], py, js[r["id"]]))
for m in mismatch:
    print("   ", m)
check("python and trace.js agree on all %d reviews (%d same)" % (total, same), same == total)
kinds = set()
# The test is only worth something if every path was exercised.
for seed in range(40):
    w = world(seed)
    ctx = CT.Context(w["services"], w["gatechecks"], w["assign"], w["buses"], w["dutylog"], w["itslookup"], w["rbalias"])
    for r in w["reviews"]:
        tr = CT.resolve({"pnr": r["pnr"], "routeId": r["routeId"], "boardAt": CT.parse_local(r["boardAt"])}, ctx)
        kinds.add(tr["confidence"])
        for c in tr["crew"]:
            kinds.update(c["vias"])
check("every source and confidence was exercised: %s" % sorted(kinds),
      {"high", "medium", "conflict", "none", "gate", "duty", "its", "redpro"} <= kinds)

# What a crew member is shown.
cp = CT.crew_copy({"id": "rv-1", "pnr": "123456", "seats": ["L4"], "boardAt": "2026-10-07 06:15:00", "stars": 2,
                   "comment": "call me on 98290 12345 driver rash", "source": "Jaipur", "dest": "Indore", "tags": ["Driving"]},
                  {"bus": {"regNo": "MP44ZD0471"}})
check("no PNR, seat or boarding time", "pnr" not in cp and "seats" not in cp and cp["date"] == "2026-10-07")
check("a phone number in the comment is masked", "98290" not in cp["comment"] and "rash" in cp["comment"])

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)

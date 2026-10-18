"""The review trace (trace.js + duty.js), on the server, for one purpose: showing a driver or
conductor the redBus reviews of their own trips.

Managers' phones trace reviews themselves from the stores they sync. A crew member's phone
cannot: it is never sent the reviews, redBus's assignments or the ITS matches (redact_for), and
should not be. So the server traces, and hands each crew member only what is theirs.

This must give the same answer as trace.js. test_crew_trace.py runs both on the same data and
compares. Times are IST wall clock, as the app's are (the server itself runs in UTC).

Standard library only.
"""
import re
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
H = 3600 * 1000
LOOKBACK = 30 * H


def parse_local(s):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?", str(s or ""))
    if not m:
        return None
    try:
        d = datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), int(m[6] or 0), tzinfo=IST)
    except ValueError:
        return None
    return int(d.timestamp() * 1000)


def _ist(ts):
    return datetime.fromtimestamp(ts / 1000, IST)


def day_key(ts):
    return _ist(ts).strftime("%Y-%m-%d")


def norm_reg(s):
    r = re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
    m = re.match(r"^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$", r)
    return m[1] + m[2].zfill(2) + m[3] + m[4].zfill(4) if m else r


def norm_name(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def alias_id(name, reg):
    return "al-%s-%s" % (norm_reg(reg), norm_name(name).replace(" ", "_"))


def departure_for(service, board_at):
    m = re.match(r"^(\d{1,2}):(\d{2})", (service or {}).get("startTime") or "")
    if not m or board_at is None:
        return None
    d = _ist(board_at)
    try:
        dep = int(datetime(d.year, d.month, d.day, int(m[1]), int(m[2]), tzinfo=IST).timestamp() * 1000)
    except ValueError:
        return None
    while dep > board_at:
        dep -= 24 * H
    return dep if board_at - dep <= LOOKBACK else None


def trip_window(dep, board_at):
    if dep is not None:
        return dep - 6 * H, dep + 3 * H
    return board_at - LOOKBACK, board_at


def its_trip_time(r):
    """ITS gives "DD-MM-YYYY" and "09:30 PM"; same rule as itsTripTime in app.js."""
    d = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", r.get("journeyDate") or "")
    if not d:
        return None
    tm = re.match(r"^(\d{1,2}):(\d{2})\s*([AP]M)?", r.get("startTime") or "", re.I)
    h, mi = (int(tm[1]), int(tm[2])) if tm else (0, 0)
    if tm and tm[3]:
        pm = tm[3].upper() == "PM"
        if pm and h < 12:
            h += 12
        if not pm and h == 12:
            h = 0
    try:
        return int(datetime(int(d[3]), int(d[2]), int(d[1]), h, mi, tzinfo=IST).timestamp() * 1000)
    except ValueError:
        return None


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


class Context:
    """Everything resolve() needs, indexed once for a whole batch of reviews."""

    def __init__(self, services, gatechecks, assign, buses, dutylog, itslookup, rbalias):
        self.services = {str(s.get("id")): s for s in services if isinstance(s, dict)}
        self.route_ix = {}
        for s in services:
            for r in (s or {}).get("routeIds") or []:
                self.route_ix[str(r)] = str(s.get("id"))
        self.gate_by_svc = {}
        for c in gatechecks:
            if isinstance(c, dict) and not c.get("_deleted") and _num(c.get("startedAt")) is not None:
                self.gate_by_svc.setdefault(str(c.get("serviceId") or ""), []).append(c)
        self.assign_by = {}
        for a in assign:
            if isinstance(a, dict):
                self.assign_by.setdefault((str(a.get("serviceId")), a.get("date")), []).append(a)
        self.bus_by_reg = {norm_reg(b.get("regNo")): b for b in buses if isinstance(b, dict)}
        self.bus_by_id = {b.get("id"): b for b in buses if isinstance(b, dict)}
        # Duty log: per crew member, rows oldest first (ties by id), as duty.js timelineOf.
        live = [r for r in dutylog if isinstance(r, dict) and not r.get("_deleted") and r.get("crewId")
                and _num(r.get("at")) is not None]
        self.timeline = {}
        for r in live:
            self.timeline.setdefault(r["crewId"], []).append(r)
        for tl in self.timeline.values():
            tl.sort(key=lambda r: (r["at"], str(r.get("id") or "")))
        # Seat spans per (bus, role): (start, end, crewId).
        self.spans = {}
        for cid, tl in self.timeline.items():
            for i, r in enumerate(tl):
                end = tl[i + 1]["at"] if i + 1 < len(tl) else float("inf")
                self.spans.setdefault((r.get("busId"), r.get("role")), []).append((r["at"], end, cid))
        self.alias = {a.get("id"): a.get("crewId") for a in rbalias
                      if isinstance(a, dict) and a.get("status") == "crew" and a.get("crewId")}
        self.its = {}
        for r in itslookup:
            if not isinstance(r, dict) or not r.get("found") or not r.get("crewId"):
                continue
            at = its_trip_time(r)
            reg = ""
            if at is not None:
                row = self._state_at(r["crewId"], at)
                bus = self.bus_by_id.get(row.get("busId")) if row and row.get("busId") else None
                reg = (bus or {}).get("regNo") or ""
            self.its[str(r.get("pnr"))] = {"crewId": r["crewId"], "regNo": reg, "at": at}

    def _state_at(self, crew_id, t):
        cur = None
        for r in self.timeline.get(crew_id, []):
            if r["at"] > t:
                break
            cur = r
        return cur

    def crew_at(self, bus_id, at):
        out = []
        for role in ("driver", "conductor"):
            hits = sorted((max(s, at), cid) for s, e, cid in self.spans.get((bus_id, role), []) if not (e <= at or s >= at + 1))
            out += [{"crewId": cid, "role": role} for _since, cid in hits]
        return out

    def from_gate(self, service_id, win):
        hits = [c for c in self.gate_by_svc.get(service_id, []) if win[0] <= c["startedAt"] <= win[1]]
        if not hits:
            return None
        c = max(hits, key=lambda c: c["startedAt"])
        return {"busId": c.get("busId"), "regNo": c.get("regNo"), "at": c["startedAt"], "driverId": c.get("driverId")}

    def from_redpro(self, service_id, win):
        obs = []
        for day in {day_key(win[0]), day_key(win[1])}:
            for a in self.assign_by.get((service_id, day), []):
                for o in a.get("obs") or []:
                    at = _num((o or {}).get("at"))
                    if o.get("vehicleNo") and at is not None and win[0] - 12 * H <= at <= win[1] + 12 * H:
                        obs.append(o)
        if not obs:
            return None
        mid = (win[0] + win[1]) / 2
        o = sorted(obs, key=lambda x: abs(x["at"] - mid))[0]
        return {"regNo": o["vehicleNo"], "driver1": o.get("driver1") or "", "driver2": o.get("driver2") or "",
                "cro": o.get("cro") or "", "at": o["at"]}


def resolve(item, ctx):
    """trace.js resolve(), returning what the crew view needs: bus, crew [{crewId, role, vias}],
    confidence."""
    out = {"bus": None, "crew": [], "confidence": "none"}
    service_id = str(item["serviceId"]) if item.get("serviceId") else ctx.route_ix.get(str(item.get("routeId") or "")) or None
    gate = rp = its = None
    if service_id and item.get("boardAt") is not None:
        dep = departure_for(ctx.services.get(service_id), item["boardAt"])
        win = trip_window(dep, item["boardAt"])
        gate, rp = ctx.from_gate(service_id, win), ctx.from_redpro(service_id, win)
    else:
        dep = None
    hit = ctx.its.get(str(item.get("pnr"))) if item.get("pnr") else None
    if hit and (hit["regNo"] or hit["crewId"]):
        its = hit
    g = norm_reg(gate["regNo"]) if gate else None
    r = norm_reg(rp["regNo"]) if rp else None
    i = norm_reg(its["regNo"]) if its and its["regNo"] else None
    answers = [x for x in (g, r, i) if x]
    if not answers and its and its["crewId"]:
        out.update(crew=[{"crewId": its["crewId"], "role": "driver", "vias": ["its"]}], confidence="medium")
        return out
    if not answers:
        return out
    agree = all(a == answers[0] for a in answers)
    pick = g or r or i
    bus = ctx.bus_by_reg.get(pick)
    src = gate or rp or its
    out["bus"] = {"regNo": src["regNo"], "busId": bus.get("id") if bus else (gate.get("busId") if gate else None)}
    out["confidence"] = "conflict" if not agree else "high" if g else "medium"
    at = gate["at"] if gate else dep if dep is not None else item["boardAt"]
    crew = [dict(c, vias=["duty"]) for c in ctx.crew_at(out["bus"]["busId"], at)] if out["bus"]["busId"] else []

    def add(crew_id, role, via):
        for c in crew:
            if c["crewId"] == crew_id:
                if via not in c["vias"]:
                    c["vias"].append(via)
                return
        e = {"crewId": crew_id, "role": role, "vias": [via]}
        if via == "gate":
            crew.insert(0, e)
        else:
            crew.append(e)

    if gate and gate.get("driverId"):
        add(gate["driverId"], "driver", "gate")
    if its and its["crewId"] and (not i or i == norm_reg(out["bus"]["regNo"])):
        add(its["crewId"], "driver", "its")
    if rp and norm_reg(rp["regNo"]) == norm_reg(out["bus"]["regNo"]):
        for name, role in ((rp["driver1"], "driver"), (rp["driver2"], "driver"), (rp["cro"], "conductor")):
            cid = ctx.alias.get(alias_id(name, rp["regNo"])) if name else None
            if cid:
                add(cid, role, "redpro")
    out["crew"] = crew
    return out


_LONG_NUMBER = re.compile(r"\d[\d\s-]{5,}\d")


def crew_copy(review, trace):
    """What a crew member is shown of a review: what was said and about which trip, never who said
    it. No PNR, seat or boarding time; a long number in the text (a phone) is masked."""
    return {"id": review.get("id"), "stars": review.get("stars"),
            "date": (review.get("boardAt") or "")[:10], "source": review.get("source") or "",
            "dest": review.get("dest") or "", "comment": _LONG_NUMBER.sub("••••", review.get("comment") or ""),
            "tags": list(review.get("tags") or []), "regNo": ((trace.get("bus") or {}).get("regNo")) or ""}


def index_by_crew(reviews, ctx, since):
    """crewId -> [crew_copy + vias], newest first, for reviews boarded from `since`. A review whose
    sources disagree on the bus is left out: it is not yet known to be anyone's."""
    out = {}
    for rv in reviews:
        if not isinstance(rv, dict) or rv.get("_deleted"):
            continue
        at = parse_local(rv.get("boardAt"))
        if at is None or at < since:
            continue
        tr = resolve({"pnr": rv.get("pnr"), "routeId": rv.get("routeId"), "boardAt": at}, ctx)
        if tr["confidence"] == "conflict":
            continue
        for c in tr["crew"]:
            out.setdefault(c["crewId"], []).append(dict(crew_copy(rv, tr), vias=list(c["vias"]), _at=at))
    for lst in out.values():
        lst.sort(key=lambda x: -x["_at"])
        for x in lst:
            x.pop("_at", None)
    return out

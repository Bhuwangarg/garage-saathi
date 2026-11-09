#!/usr/bin/env python3
"""What does the outside-repair cut cost? The two numbers contract 8 asserts, measured.

Contract 5 puts a bounded scan of `gatepasses` inside /push -- the one endpoint
every device calls every four seconds -- and contract 2.3 claims a rewind that costs
one role's devices instead of the whole fleet. Both are claims. This reads them off
a fleet-sized LOCAL fixture, in the units 03 section 8 uses (ms of server time,
requests per drain), the way measure-pull.py does. It is the HARNESS;
test_outside_cost.py is the budget that fails a build, and imports this.

    python3 scripts/measure-outside.py

Never production. The database is a tempfile built here (via measure-pull's fixture,
which scrubs DATABASE_URL / TURSO_* and refuses a non-temp sync_server), nothing is
printed that could be a secret, and no port is bound: push() and pull() are called
in-process.

The fixture is measure-pull's 80,700 rows PLUS 2,000 gate passes spread over 400
outside job cards (5 passes each, all returned, each with a cost). The passes are
added on top of the 80,700 because that figure is the existing fleet and the
question is what this feature adds to it.

Four things are measured, and kept apart on purpose:
  1. /push of an outside job card, with and without the externalCost recompute
     (interleaved, so drift hits both); both medians and the delta.
  2. /push of a record in an UNRELATED store. The delta must be zero. Milliseconds
     cannot show zero, so this is also read as WORK: how many times the recompute
     was called, and how many SQL statements named `gatepasses`.
  3. The close transition's pass lookup. It runs once in a card's life and is not
     the recompute; folding the two together would hide which one a regression is.
  4. The drain a crew manager performs after the rewind: pages, bytes, rows, and
     what the passes add to it.
"""
import importlib.util
import json
import os
import platform
import random
import statistics
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

_spec = importlib.util.spec_from_file_location("measure_pull", os.path.join(HERE, "measure-pull.py"))
MP = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(MP)
S = MP.S

PASSES = 2000
CARDS = 400                       # 5 passes per outside card
OWNER = {"id": "u-owner", "role": "owner"}
CREWM = {"id": "u-cm", "role": "crewmanager"}
BUDGET_MS = 5.0                   # contract 8

# ---------------------------------------------------------------------------
# Counting what the database was asked, so "zero" can be read as zero
# ---------------------------------------------------------------------------
_seen = []
_tracing = [False]
_prev_db = S.db


def _tracing_db():
    c = _prev_db()
    if _tracing[0]:
        c.set_trace_callback(_seen.append)
    return c


S.db = _tracing_db

_recompute_calls = [0]
_real_recompute = S._recompute_external_cost


def _counting_recompute(*a, **k):
    _recompute_calls[0] += 1
    return _real_recompute(*a, **k)


def _no_recompute(*a, **k):
    return None


S._recompute_external_cost = _counting_recompute


class _Mode:
    """Swap the recompute for the duration of a with-block. push() looks it up by
    global name at call time, so patching the module attribute reaches it."""
    def __init__(self, fn):
        self.fn = fn

    def __enter__(self):
        self.old = S._recompute_external_cost
        S._recompute_external_cost = self.fn

    def __exit__(self, *e):
        S._recompute_external_cost = self.old


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------
def build(seed=11):
    """measure-pull's fleet, then the passes and their cards. -> info dict."""
    info = MP.build_fixture(seed=seed)
    rng = random.Random(seed)
    now = int(time.time() * 1000)
    rev = info["maxrev"]
    rows = []
    for k in range(CARDS):
        rev += 1
        card = {"id": "oc-%d" % k, "busId": "b%d" % (k % 60), "problem": "Outside job",
                "status": "open", "priority": "low", "createdAt": now, "updatedAt": now,
                "assignees": [], "partsUsed": [], "beforePhotos": [], "afterPhotos": [],
                "outside": True, "externalVendor": "Vendor %d" % (k % 9),
                "gatePassId": "gp-%d" % (k * 5), "billPhotos": []}
        rows.append(("jobcards", card["id"], json.dumps(card, separators=(",", ":")), now, rev))
    for i in range(PASSES):
        rev += 1
        gp = {"id": "gp-%d" % i, "no": "OJ-261101-%04X" % i, "status": "returned",
              "vendorName": "Vendor %d" % (i % 9), "busId": "b%d" % ((i // 5) % 60),
              "jobId": "oc-%d" % (i // 5), "unitName": "Alternator", "unitSerial": "S%d" % i,
              "returnSerial": "S%d" % i, "issuedAt": now - 86400000, "returnedAt": now,
              "updatedAt": now, "cost": 500 + rng.randrange(2000), "serialMismatch": False,
              "remark": "x" * 60}
        if i == 35:
            gp["billPhoto"] = "/uploads/bill.jpg"      # oc-7's pointed pass carries the bill
        rows.append(("gatepasses", gp["id"], json.dumps(gp, separators=(",", ":")), now, rev))
    with S._lock:
        c = _prev_db()
        c.executemany("INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)", rows)
        c.commit()
        c.close()
    info["passes"] = PASSES
    info["cards"] = CARDS
    return info


# ---------------------------------------------------------------------------
# 1 and 2: /push
# ---------------------------------------------------------------------------
# Real time, and never the same ms twice: push() clamps anything beyond now + 5 min, and a clamped
# stamp is not newer than the last, so the write would be refused as stale.
_clock = [int(time.time() * 1000)]


def _stored(store, rid):
    c = _prev_db()
    try:
        r = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
        return json.loads(r[0]) if r else None
    finally:
        c.close()


def _tick(stored_at):
    """The next stamp to push with: ahead of our own last one, ahead of the wall
    clock, AND ahead of what the server actually stored.

    The third term is the one this harness was missing, and it cost a CI build.
    THE SERVER DOES NOT ALWAYS STORE WHAT YOU SENT. When the guard changes the
    payload -- which is exactly what the recompute under measurement does, the
    first time it touches each card and sets externalCost -- sync_server.py:4058
    re-stamps the row `max(upd + 1, now_ms(), row.updatedAt + 1)`. Measured on an
    idle machine: the a-push sent 1794222635667 and the server stored
    ...676, nine milliseconds ahead, because the 2,000-pass scan took that long
    and now_ms() won.

    The b-push of the same pair then sends max(sent_a + 1, wall) -- and `wall`,
    read just after the a-push returned, lands within a millisecond or two of
    the stamp the server already used. Measured margins on an idle machine were
    +3 to +13 ms. On a slower machine the margin reaches zero, `upd > row[0]` is
    false, and the push is REFUSED as stale: the harness raised
    "the card push was not applied" and reddened the build.

    It bites the FIRST touch of each card and no other, because that is when
    externalCost changes, which is why it struck at n=7 of the first interleave
    and never on a repeat. Reading the stored stamp back removes the race
    entirely. Nothing about the measurement changes: the timestamp is not what
    is being timed, and the server-side work is identical either way.

    The server's own refusal is correct and is not touched. A real device
    handles it -- `reason: "stale"` is the one refusal v2's client re-applies
    (sync_server.py:4101) -- so this was a harness that did not behave like a
    client, not a product defect."""
    return max(_clock[0] + 1, int(time.time() * 1000), int(stored_at or 0) + 1)


def push_card(k, n):
    """Owner pushes outside card oc-k with one ordinary field changed (a note), the
    outside fields carried unchanged -- the shape a real edit of such a card takes."""
    d = _stored("jobcards", "oc-%d" % k)
    d["note"] = "n%d" % n
    _clock[0] = _tick(d.get("updatedAt"))
    t = time.perf_counter()
    out = S.push([{"store": "jobcards", "id": d["id"], "data": d, "updatedAt": _clock[0]}], OWNER)
    ms = (time.perf_counter() - t) * 1000
    if out.get("applied") != 1:
        raise RuntimeError("the card push was not applied: %r" % (out,))
    return ms


def push_unrelated(k, n):
    """Owner pushes a fuel record. fuel has no pass and no outside field."""
    rid = "fuel-m%d" % k
    # Same guard as push_card, for the same reason. fuel has no recompute, so
    # today the server stores what is sent -- but "today" is the word that made
    # the other one a flake, and the cost of being right here is one read.
    _clock[0] = _tick((_stored("fuel", rid) or {}).get("updatedAt"))
    d = {"id": rid, "busId": "b1", "litres": 40 + n % 7, "n": "x"}
    t = time.perf_counter()
    out = S.push([{"store": "fuel", "id": d["id"], "data": d, "updatedAt": _clock[0]}], OWNER)
    ms = (time.perf_counter() - t) * 1000
    if out.get("applied") != 1:
        raise RuntimeError("the fuel push was not applied: %r" % (out,))
    return ms


def interleaved(pusher, reps):
    """-> (median with the recompute, median without it, delta), in ms. The two
    variants alternate, so a drifting machine moves both and not their difference."""
    a, b = [], []
    for n in range(reps):
        k = n % CARDS
        with _Mode(_counting_recompute):
            a.append(pusher(k, 2 * n))
        with _Mode(_no_recompute):
            b.append(pusher(k, 2 * n + 1))
    ma, mb = statistics.median(a), statistics.median(b)
    return ma, mb, ma - mb


def unrelated_work(reps=20):
    """The zero, read as work: recompute calls and gatepasses statements across
    `reps` pushes of unrelated records, with the recompute left ON."""
    _recompute_calls[0] = 0
    del _seen[:]
    _tracing[0] = True
    try:
        with _Mode(_counting_recompute):
            for n in range(reps):
                push_unrelated(n % 10, n)
    finally:
        _tracing[0] = False
    gp = [s for s in _seen if "gatepasses" in s]
    return {"recompute_calls": _recompute_calls[0], "gatepass_statements": len(gp)}


# ---------------------------------------------------------------------------
# 3: the close transition's lookup
# ---------------------------------------------------------------------------
def close_lookup(reps=30):
    """_close_gate_met on an outside card closing with no bill photo and no reason,
    so the proof must come from a pass. Two paths, because they differ by a scan:
      pointer  oc-7's gatePassId names a returned pass carrying the bill: a point read
      scan     oc-8's passes carry no bill, so every pass of the card is looked for
               in the whole of gatepasses and none is found (the worst case)
    Plus the ordinary close, which must query nothing."""
    out, met = {}, {}
    c = _prev_db()
    try:
        for name, k, pointer in (("pointer", 7, "gp-35"), ("scan", 8, None)):
            xs = []
            for _ in range(reps):
                card = _stored("jobcards", "oc-%d" % k)
                card["status"] = "done"
                if pointer:
                    card["gatePassId"] = pointer
                t = time.perf_counter()
                ok = S._close_gate_met(c, card["id"], card)
                xs.append((time.perf_counter() - t) * 1000)
                met[name] = ok
            out[name] = statistics.median(xs)
        xs = []
        card = {"id": "plain", "status": "done", "beforePhotos": ["a"], "afterPhotos": ["b"]}
        for _ in range(reps):
            t = time.perf_counter()
            S._close_gate_met(c, card["id"], card)
            xs.append((time.perf_counter() - t) * 1000)
        out["ordinary"] = statistics.median(xs)
    finally:
        c.close()
    out["met"] = met
    return out


# ---------------------------------------------------------------------------
# 4: the crew manager's drain
# ---------------------------------------------------------------------------
def drain_measure(actor):
    """Page /pull to the end from rev 0, the way a rewound device does.
    -> {"pages", "rows", "bytes", "gatepass_rows"}. Bytes are the JSON of each page
    response, which is what crosses the wire before compression."""
    since, pages, rows, size, gps = 0, 0, 0, 0, 0
    while True:
        out = S.pull(since, actor=actor)
        pages += 1
        rows += len(out["records"])
        gps += sum(1 for r in out["records"] if r.get("store") == "gatepasses")
        size += len(json.dumps(out, separators=(",", ":")))
        since = out["maxRev"]
        if not out["more"]:
            return {"pages": pages, "rows": rows, "bytes": size, "gatepass_rows": gps}
        if pages > 500:
            raise RuntimeError("a drain that never finishes")


def drain_growth():
    """The drain after the rewind, and what gatepasses add to it: the same drain with
    the pass rows hidden from the actor (the world before the widening) against the
    drain with them. -> (before, after)."""
    after = drain_measure(CREWM)
    held = S._never_for

    def hide(actor):
        return set(held(actor)) | {"gatepasses"}
    S._never_for = hide
    try:
        before = drain_measure(CREWM)
    finally:
        S._never_for = held
    return before, after


# ---------------------------------------------------------------------------
def report(reps=60):
    info = build()
    ok, why = MP.calm()
    m = MP.machine()
    wa, wo, delta = interleaved(push_card, reps)
    ua, uo, udelta = interleaved(push_unrelated, reps)
    work = unrelated_work()
    close = close_lookup()
    before, after = drain_growth()

    L = []
    L.append("machine: %s, %d cpu, load %.2f, python %s, sqlite %s, %s%s" % (
        m["cpu"], m["ncpu"], m["load1"], m["python"], m["sqlite"], m["os"],
        "" if ok else "   [NOT CALM: %s]" % why))
    L.append("fixture: %d rows (the fleet) + %d gate passes on %d outside cards" % (
        info["rows"], info["passes"], info["cards"]))
    L.append("")
    L.append("%-52s %9s %9s %9s" % ("/push, median of %d each, ms" % reps, "with", "without", "delta"))
    L.append("%-52s %9.2f %9.2f %+9.2f   budget < %.0f" % (
        "outside job card (recompute scans gatepasses)", wa, wo, delta, BUDGET_MS))
    L.append("%-52s %9.2f %9.2f %+9.2f   budget 0" % ("record in an unrelated store (fuel)", ua, uo, udelta))
    L.append("%-52s recompute calls %d, statements naming gatepasses %d (of 20 pushes)" % (
        "  unrelated store, read as work", work["recompute_calls"], work["gatepass_statements"]))
    L.append("")
    L.append("close transition lookup, once in a card's life (ms, median of 30)")
    L.append("  %-50s %9.3f" % ("pointer hit: one point read, bill found", close["pointer"]))
    L.append("  %-50s %9.3f" % ("pointer miss: scan of gatepasses for jobId", close["scan"]))
    L.append("  %-50s %9.3f" % ("ordinary card: photos met, no query", close["ordinary"]))
    L.append("")
    L.append("crew manager drain after the rewind (from rev 0)")
    L.append("  %-18s %7s %9s %12s" % ("", "pages", "rows", "bytes"))
    L.append("  %-18s %7d %9d %12d" % ("before widening", before["pages"], before["rows"], before["bytes"]))
    L.append("  %-18s %7d %9d %12d" % ("after widening", after["pages"], after["rows"], after["bytes"]))
    L.append("  %-18s %7d %9d %12d   budget: < 1 page" % (
        "grows by", after["pages"] - before["pages"], after["rows"] - before["rows"],
        after["bytes"] - before["bytes"]))
    L.append("  gatepasses rows delivered after widening: %d" % after["gatepass_rows"])
    held = delta < BUDGET_MS
    grew = after["pages"] - before["pages"]
    L.append("drain budget (grows by < 1 page): %s" % ("HELD" if grew < 1 else
             "MISSED by %d page(s): contract 8 changes, through the lead, in its section 12" % grew))
    L.append("")
    L.append("push budget (< %.0f ms): %s" % (BUDGET_MS, "HELD" if held else
             "MISSED -- apply contract 8's fallback: recompute on the close transition only"))
    L.append("Milliseconds are this machine's. The office runs Core 2 Duos; read them as a ratio.")
    print("\n".join(L))
    return {"delta": delta, "udelta": udelta, "work": work, "close": close,
            "before": before, "after": after}


if __name__ == "__main__":
    report()

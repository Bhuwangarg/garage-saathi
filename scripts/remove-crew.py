#!/usr/bin/env python3
"""Permanently remove crew — drivers, conductors, or both — and collapse duplicate logins.

    # conductors only, drivers left alone
    /usr/bin/python3 scripts/remove-crew.py --role conductor \\
        --server https://garage-saathi-sync.vercel.app

--role is required and has no default. Deleting the wrong half of the crew is
not a mistake the backup makes painless, so the choice has to be typed out.

Owner PIN only, typed at a prompt and never echoed.

This deletes. The crew bank was built on the rule that nothing is ever deleted —
a man who left in 2024 and reappears in 2026 must still be findable, with the
licence number he gave last time. The app's own tool for clearing the roster is
`Archive the whole register`, which is reversible and keeps every record
searchable. This script is the other thing, for when that is genuinely what is
wanted.

So it writes a full backup FIRST and refuses to go on if that fails, and it
makes you type the word out. Restoring from the backup is
`scripts/restore-backup.py`.
"""
import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request

CREW_ROLES = ("driver", "conductor")


def rec_role(r):
    """A record in the `drivers` store is a conductor only if it says so.

    Matches crewRoleOf() in app.js — conductors were added to the existing
    store rather than a new one, and anything not flagged is a driver.
    """
    return "conductor" if (r.get("data") or {}).get("crewRole") == "conductor" else "driver"


def call(base, path, payload, token=None, method="POST", timeout=60):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "garage-saathi-remove-crew/1.0")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"error": raw.decode("utf-8", "replace")[:200]}


def get(base, path, token, timeout=180):
    req = urllib.request.Request(base + path, method="GET")
    req.add_header("User-Agent", "garage-saathi-remove-crew/1.0")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def pull_all(base, token):
    """Every record, following the cursor. /pull is paginated."""
    out, since = [], 0
    while True:
        d = get(base, "/pull?since=%d" % since, token)
        rows = d.get("records") or []
        out.extend(rows)
        nxt = d.get("maxRev") or 0
        if not d.get("more") or nxt <= since:
            break
        since = d.get("cursor") or nxt
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--role", required=True, choices=("conductor", "driver", "both"),
                    help="which half of the crew goes. No default, on purpose.")
    ap.add_argument("--user", default="u-owner")
    ap.add_argument("--dry-run", action="store_true", help="show what would go, change nothing")
    a = ap.parse_args()
    base = a.server.rstrip("/")
    target = CREW_ROLES if a.role == "both" else (a.role,)
    what = "drivers and conductors" if a.role == "both" else a.role + "s"
    adj = "crew" if a.role == "both" else a.role          # "conductor records", not "conductors records"

    print("Server: %s" % base)
    print("Removing: %s%s" % (what, "" if a.role == "both" else
                              " only — the %s stay" % ("drivers" if a.role == "conductor" else "conductors")))
    pin = getpass.getpass("  owner PIN (not echoed): ")
    st, res = call(base, "/auth/login", {"userId": a.user, "pin": pin})
    del pin
    if st == 429:
        sys.exit("Locked out: wait %s seconds." % res.get("retryAfterSec", "?"))
    if st != 200 or "token" not in res:
        sys.exit("Login failed (%s). Nothing was changed." % st)
    token = res["token"]
    if (res.get("user") or {}).get("role") != "owner":
        sys.exit("Deleting a login is owner-only; %s is a %s." % (a.user, (res.get("user") or {}).get("role")))
    print("  ok — %s\n" % (res["user"]["name"]))

    roster = get(base, "/roster", None)
    roster = roster.get("users") if isinstance(roster, dict) else roster
    crew_logins = [u for u in roster if u.get("role") in target]

    records = pull_all(base, token)
    crew_recs = [r for r in records
                 if r.get("store") == "drivers" and not (r.get("data") or {}).get("_deleted")
                 and rec_role(r) in target]
    buses = [r for r in records if r.get("store") == "buses" and not (r.get("data") or {}).get("_deleted")]

    # Duplicates by name, among management accounts only.
    #
    # Crew are NEVER matched by name. A crew account id is derived from the bus
    # (u-drv-<REG>-0), so two accounts sharing a name are normally two different
    # men on two different buses: Gauri Shankar on NL07B902 is not Gauri Shankar
    # on MP44ZD9385, and collapsing them deletes a real driver's login. Only
    # management accounts are created by hand with a random id, which is the only
    # way one person ends up with several — five Sumits, all crewmanager.
    #
    # This was briefly wrong. When --role arrived, the filter became "any role not
    # being deleted", which let the surviving half of the crew in, and a run that
    # was told to remove conductors also offered two same-named drivers as
    # duplicates.
    from collections import defaultdict
    by_name = defaultdict(list)
    for u in roster:
        if u.get("role") not in target and u.get("role") not in CREW_ROLES:
            by_name[(u.get("name") or "").strip().lower()].append(u)
    dupes = {n: us for n, us in by_name.items() if len(us) > 1}

    # Only unhook the seat that is being emptied. Deleting the conductors must
    # not wipe the driver names off the fleet as a side effect.
    bus_fields = []
    if "conductor" in target:
        bus_fields += ["conductor", "conductorUserId"]
    if "driver" in target:
        bus_fields += ["driverCrew"]
    linked = [b for b in buses if any((b.get("data") or {}).get(f) for f in bus_fields)]

    print("About to remove:")
    print("  %-34s %d" % ("%s records" % adj, len(crew_recs)))
    print("  %-34s %d" % ("%s logins" % adj, len(crew_logins)))
    print("  %-34s %d" % ("buses losing the %s name" % adj, len(linked)))
    staying = [r for r in records if r.get("store") == "drivers"
               and not (r.get("data") or {}).get("_deleted") and rec_role(r) not in target]
    if staying:
        print("  %-34s %d  (untouched)" % ("crew records staying", len(staying)))
    if dupes:
        print("\nDuplicate management logins (same name, more than one account).")
        print("Crew are never listed here — two drivers can share a name.")
        print("You pick one to keep from each set; the rest go:")
        for n, us in dupes.items():
            print("  %s ×%d" % (us[0].get("name"), len(us)))
            for i, u in enumerate(us, 1):
                print("      %d) %s" % (i, u.get("id")))

    # --- back up before touching anything ------------------------------------
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = os.path.abspath("crew-backup-%s.json" % stamp)
    payload = {"app": "garage-saathi", "kind": "crew-removal-backup", "at": stamp,
               "roster": roster, "records": [r for r in records if r.get("store") in ("drivers", "buses", "users")]}
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
    except Exception as e:
        sys.exit("Could not write the backup (%s). Refusing to delete anything." % e)
    size = os.path.getsize(path)
    if size < 1000:
        sys.exit("Backup looks empty (%d bytes). Refusing to delete anything." % size)
    print("\nBackup written: %s (%d KB)" % (path, size // 1024))
    print("Restore with: /usr/bin/python3 scripts/restore-backup.py %s --server %s ..." % (path, base))

    if a.dry_run:
        print("\n--dry-run: nothing was changed.")
        return 0

    print("\nThis is permanent. Licence numbers, Aadhaar, documents, photos and")
    print("employment history for these people are not recoverable except from the")
    print("backup above.")
    typed = input('Type DELETE to go ahead: ').strip()
    if typed.upper() != "DELETE":
        # Case-insensitive on purpose. The guard is "type the whole word out",
        # which a lowercase `delete` satisfies just as deliberately. Rejecting
        # that silently taught nobody anything — it just looked like a run that
        # had worked while the server stayed untouched.
        if typed:
            print("\nYou typed %r. The word is DELETE — nothing was changed." % typed)
        else:
            print("\nNothing was typed, so nothing was changed.")
        print("Run it again to try once more. The backup above is still on disk.")
        return 1
    print("")

    # The job that was asked for happens FIRST, and finishes, before anything
    # optional is raised.
    #
    # It used to run the other way round: the duplicate-login question came
    # first, and its prompt re-asked itself silently on anything it did not
    # understand, so it read as a hang. Backing out there lost the deletion
    # that had actually been asked for — after a backup had been written and
    # DELETE typed, which made it look like the run had worked.

    def delete_logins(ids, label):
        gone = failed = 0
        for uid in ids:
            st, res = call(base, "/auth/users/delete", {"id": uid}, token=token)
            if st == 200:
                gone += 1
            else:
                failed += 1
                print("  could not delete %s: %s" % (uid, res.get("error")))
        print("  %d %s deleted%s." % (gone, label, (", %d failed" % failed) if failed else ""))
        return gone

    # --- remove the crew records, and unhook them from the buses -------------
    now = int(time.time() * 1000)
    batch = [{"store": "drivers", "id": r["id"], "data": {"id": r["id"], "_deleted": True},
              "updatedAt": now} for r in crew_recs]
    for b in linked:
        d = dict(b.get("data") or {})
        for f in bus_fields:
            d.pop(f, None)
        batch.append({"store": "buses", "id": b["id"], "data": d, "updatedAt": now})

    print("Removing the %s now." % what)
    applied = 0
    for i in range(0, len(batch), 100):
        st, res = call(base, "/push", {"records": batch[i:i + 100]}, token=token)
        if st != 200:
            print("push failed (%s): %s" % (st, res))
            break
        applied += res.get("applied", 0)
        print("  records %d/%d" % (min(i + 100, len(batch)), len(batch)), flush=True)
    print("  %d record(s) removed." % applied)
    delete_logins([u["id"] for u in crew_logins], "login(s)")
    print("\nThe %s are gone. Everything below is optional — stopping here\nleaves that done." % what)

    # --- then, separately, collapse the duplicate logins ---------------------
    try:
        for n, us in dupes.items():
            name = us[0].get("name")
            print("\n%s has %d accounts. ONE STAYS — the other %d are deleted."
                  % (name, len(us), len(us) - 1))
            for i, u in enumerate(us, 1):
                print("   %d) %s" % (i, u.get("id")))
            keep_id = None
            while True:
                raw = input("   which one stays? (1-%d, or s to keep all %d): "
                            % (len(us), len(us))).strip().lower()
                if raw == "s":
                    break
                if raw.isdigit() and 1 <= int(raw) <= len(us):
                    keep_id = us[int(raw) - 1]["id"]
                    break
                print("   Type a number from 1 to %d, or s to leave all %d alone."
                      % (len(us), len(us)))
            if not keep_id:
                print("   left alone — all %d %s accounts stay." % (len(us), name))
                continue

            # Set a PIN on the survivor before removing its twins.
            #
            # Otherwise the obvious question has a bad answer: five accounts
            # named Sumit existed, he knows the PIN of whichever one he has
            # been using, and there is no way to tell from here which that is.
            # Delete the other four and there is a four-in-five chance he can
            # no longer sign in. Setting a PIN on the one that stays makes it
            # certain — tell him what it is, and have him change it in
            # Me -> Change my PIN.
            print("   %s keeps %s. Set the PIN he will use (blank = leave it alone)."
                  % (name, keep_id))
            p1 = getpass.getpass("   new 4-digit PIN: ")
            if p1 == "":
                print("   left unchanged — make sure he knows which PIN belongs to %s." % keep_id)
            elif not (len(p1) == 4 and p1.isdigit()):
                print("   not 4 digits — left unchanged.")
            else:
                p2 = getpass.getpass("   confirm: ")
                if p1 != p2:
                    print("   did not match — left unchanged.")
                else:
                    st, res = call(base, "/auth/setpin", {"userId": keep_id, "pin": p1}, token=token)
                    print("   %s" % ("PIN set." if st == 200
                                     else "could not set it (%s): %s" % (st, res.get("error"))))
                del p2
            del p1
            delete_logins([u["id"] for u in us if u["id"] != keep_id],
                          "duplicate %s login(s)" % name)
    except (EOFError, KeyboardInterrupt):
        # Ctrl-C here must not read as "the whole run failed".
        print("\n\nStopped. The %s are still gone — only the duplicate logins\nwere left alone." % what)

    left = get(base, "/roster", None)
    left = left.get("users") if isinstance(left, dict) else left
    print("\nRoster now: %d accounts (%d %s remaining, %d other crew)."
          % (len(left),
             len([u for u in left if u.get("role") in target]), what,
             len([u for u in left if u.get("role") in CREW_ROLES and u.get("role") not in target])))
    return 0


if __name__ == "__main__":
    sys.exit(main())

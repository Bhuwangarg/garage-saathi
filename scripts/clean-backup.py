#!/usr/bin/env python3
"""Clean a device backup before restoring it. Never edits the input file.

    python3 scripts/clean-backup.py backup.json -o backup-clean.json \
        --drop-store gpsevents

The app soft-deletes: a removed record stays in IndexedDB carrying _deleted so
the deletion can sync to other devices. A raw export therefore contains both the
live fleet and every row ever deleted, and the deleted ones have the NEWEST
updatedAt — deleting is the last thing that happened to them.

That matters more than it sounds. An earlier version of this script deduplicated
by registration and kept "the most recently updated row", which silently chose a
tombstone over the live bus for four registrations and would have restored them
as deleted. So: tombstones are dropped outright, and nothing is merged.

If live duplicates genuinely exist the script reports them and stops, rather than
guessing which row is the real bus.
"""
import argparse
import collections
import json
import sys


def norm_reg(bus):
    return (bus.get("regNo") or "").strip().upper().replace(" ", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("backup")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--drop-store", action="append", default=[],
                    help="drop a whole store, e.g. --drop-store gpsevents")
    ap.add_argument("--keep-tombstones", action="store_true",
                    help="restore deleted rows too, so deletions stay authoritative")
    a = ap.parse_args()

    with open(a.backup, encoding="utf-8") as f:
        backup = json.load(f)
    if backup.get("app") != "garage-saathi":
        sys.exit("not a Garage Saathi backup")
    data = backup.get("data") or {}

    # --- tombstones ------------------------------------------------------------
    if not a.keep_tombstones:
        for store in list(data):
            rows = data.get(store) or []
            live = [r for r in rows if not r.get("_deleted")]
            if len(live) != len(rows):
                print("%-12s %d rows -> %d live (%d deleted on the device)"
                      % (store, len(rows), len(live), len(rows) - len(live)))
                data[store] = live

    # --- whole stores ----------------------------------------------------------
    for store in a.drop_store:
        n = len(data.get(store) or [])
        data[store] = []
        print("%-12s dropped entirely (%d records)" % (store, n))

    # --- report, and refuse to guess ------------------------------------------
    buses = data.get("buses") or []
    regs = collections.Counter(norm_reg(b) for b in buses)
    dupes = {r: n for r, n in regs.items() if n > 1}
    if dupes:
        print("\nLive duplicate registrations — not resolving these automatically:")
        for r, n in dupes.items():
            print("   %-14s %d live rows" % (r, n))
        sys.exit("refusing to guess which row is the real bus; fix it in the app, re-export, and re-run")

    by_source = collections.Counter(b.get("source") for b in buses)
    print("\nfleet: %d buses  (%s)" % (
        len(buses), ", ".join("%s %d" % (k or "manual", v) for k, v in by_source.most_common())))

    backup["data"] = data
    backup["counts"] = {s: len(data.get(s) or []) for s in data}
    backup["cleanedFrom"] = a.backup
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(backup, f)
    print("total records: %d" % sum(len(v or []) for v in data.values()))
    print("written: %s   (input untouched)" % a.out)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Restore a device backup (export.html) into a fresh sync server.

    python3 scripts/restore-backup.py backup.json \
        --server https://garage-saathi-sync.onrender.com \
        --user u-owner --pin 1111 --import-token "$IMPORT_TOKEN"

Add --dry-run first: it reads the file, logs in, and reports exactly what would
be written without sending a single record.

Why this talks to /admin/import instead of /push: push() stamps _by/_byRole from
the caller's token, so restoring through it would re-attribute every record to
whoever ran the restore and destroy the actor trail the Pilferage Radar reads.
/admin/import applies the records with actor=None, preserving the provenance
already inside the backup.

`users` is skipped by default. Login accounts live in the server's own `users`
table with salted PIN hashes; the synced `users` records are only a PIN-free
roster, and pushing them cannot create a login. Restoring them is harmless but
pointless, and it makes the diff noisy. Pass --include-users to send them anyway.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

# The device backup keys records by whatever IndexedDB store they came from, and
# those names are already the sync store names — no translation needed.
SKIP_BY_DEFAULT = {"users"}


def call(url, payload, token=None, import_token=None):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    # The stdlib default User-Agent is rejected by some proxies in front of the
    # app; send an ordinary one.
    req.add_header("User-Agent", "garage-saathi-restore/1.0")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if import_token:
        req.add_header("X-Import-Token", import_token)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"error": raw.decode("utf-8", "replace")[:400]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("backup")
    ap.add_argument("--server", required=True)
    ap.add_argument("--user", default="u-owner")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--import-token", required=True)
    ap.add_argument("--batch", type=int, default=200)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-users", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="merge into a database that already holds records")
    a = ap.parse_args()
    base = a.server.rstrip("/")

    with open(a.backup, encoding="utf-8") as f:
        backup = json.load(f)
    if backup.get("app") != "garage-saathi":
        sys.exit("not a Garage Saathi backup: %s" % a.backup)

    data = backup.get("data") or {}
    skip = set() if a.include_users else SKIP_BY_DEFAULT

    records, summary = [], []
    for store in sorted(data):
        rows = data[store] or []
        if not rows:
            continue
        if store in skip:
            summary.append("  %-14s %6d  (skipped — see --include-users)" % (store, len(rows)))
            continue
        key = "rc" if store == "challans" else ("key" if store == "meta" else "id")
        kept = 0
        for rec in rows:
            rid = rec.get(key)
            if rid is None:
                continue                      # no primary key → the server would drop it anyway
            records.append({"store": store, "id": str(rid), "data": rec,
                            "updatedAt": int(rec.get("updatedAt") or 0)})
            kept += 1
        summary.append("  %-14s %6d" % (store, kept))

    print("Backup taken %s from %s" % (backup.get("exportedAt", "?"), backup.get("origin", "?")))
    print("\n".join(summary))
    print("  %-14s %6d records to restore" % ("TOTAL", len(records)))
    if not records:
        sys.exit("nothing to restore")

    print("\nLogging in as %s at %s ..." % (a.user, base))
    st, res = call(base + "/auth/login", {"userId": a.user, "pin": a.pin})
    if st != 200 or "token" not in res:
        sys.exit("login failed (%s): %s" % (st, res))
    token = res["token"]
    print("  ok — %s (%s)" % (res["user"]["name"], res["user"]["role"]))

    if a.dry_run:
        print("\n--dry-run: nothing was sent.")
        return

    sent = applied = rejected = 0
    for i in range(0, len(records), a.batch):
        chunk = records[i:i + a.batch]
        payload = {"records": chunk}
        # force only needs to ride along on the first call; after that the table
        # is non-empty because of us.
        if a.force or i:
            payload["force"] = True
        st, res = call(base + "/admin/import", payload, token=token, import_token=a.import_token)
        if st != 200:
            print("\nFAILED on records %d-%d (HTTP %s): %s" % (i, i + len(chunk), st, res))
            print("Nothing further was sent. %d records had already been applied." % applied)
            sys.exit(1)
        sent += len(chunk)
        applied += res.get("applied", 0)
        rejected += res.get("rejected", 0)
        print("  %d/%d  applied=%d rejected=%d" % (sent, len(records), applied, rejected), flush=True)

    print("\nRestored %d of %d records (rejected %d)." % (applied, len(records), rejected))
    if rejected:
        print("Rejected records are usually stores the write matrix refuses; check the server log.")
    print("Verify from a device: log in and confirm the bus and part counts match the backup.")


if __name__ == "__main__":
    main()

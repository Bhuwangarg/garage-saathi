#!/usr/bin/env python3
"""Rotate the seeded management PINs on a live server.

    /usr/bin/python3 scripts/rotate-pins.py --server https://garage-saathi-sync.vercel.app

Every PIN is typed at an interactive prompt and never echoed. Nothing is passed
as an argument, so no PIN reaches your shell history, the process list, or a log.

Why this exists at all: SEED_USERS in sync_server.py hard-codes a PIN for seven
accounts, and that file is in a PUBLIC repo. Until each of those PINs is changed,
anyone who can read the repo can sign in as the owner.

Order matters. Run this BEFORE setting ENABLE_DEMO_SEED=0. That flag makes
purge_demo_users() delete every seeded account whose hash still matches its
published PIN — so flipping it first deletes the accounts instead of securing
them, and flipping it after this script has run deletes nothing.

Changing a PIN here is durable: seed_users() only inserts when the row is absent,
so a later cold boot will not put the published PIN back.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request

# Mirrors SEED_USERS in sync_server.py. The PIN is here only so the script can
# refuse to "rotate" a PIN to the value it is already published as, and so it can
# prove afterwards that the old one no longer works.
SEEDED = [
    ("u-owner", "Bhuwan (Owner)", "owner", "1111"),
    ("u-sup", "Ramesh (Supervisor)", "supervisor", "2222"),
    ("u-store", "Suresh (Store)", "store", "3333"),
    ("u-m1", "Mukesh", "mechanic", "0001"),
    ("u-m2", "Imran", "mechanic", "0002"),
    ("u-m3", "Vijay", "mechanic", "0003"),
    ("u-d1", "Ramlal (Driver)", "driver", "0010"),
]

# Refused outright. A rotation that lands on one of these has not improved much.
WEAK = {"0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888",
        "9999", "1234", "4321", "0123", "1212", "2580"}


def call(base, path, payload, token=None, timeout=30):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "garage-saathi-rotate-pins/1.0")
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


def ask_new_pin(label, published, already_used):
    """Prompt twice for a PIN, never echoing it. Returns the PIN, or None to skip."""
    while True:
        p1 = getpass.getpass("  new PIN for %s (4 digits, blank = skip): " % label)
        if p1 == "":
            return None
        if not (len(p1) == 4 and p1.isdigit()):
            print("  ! must be exactly 4 digits")
            continue
        if p1 == published:
            print("  ! that is the published PIN for this account — pick another")
            continue
        if p1 in WEAK:
            print("  ! too easy to guess — pick another")
            continue
        if p1 in already_used:
            print("  ! already used for another account in this run — pick another")
            continue
        p2 = getpass.getpass("  confirm: ")
        if p1 != p2:
            print("  ! the two entries did not match")
            continue
        return p1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--user", default="u-owner",
                    help="the account to authenticate as (must be owner or supervisor)")
    a = ap.parse_args()
    base = a.server.rstrip("/")

    print("Server: %s" % base)
    print("Authenticating as %s — this PIN is not echoed and not stored.\n" % a.user)
    pin = getpass.getpass("  current PIN for %s: " % a.user)
    st, res = call(base, "/auth/login", {"userId": a.user, "pin": pin})
    del pin
    if st == 429:
        sys.exit("Locked out: %s. Wait and retry." % res.get("retryAfterSec", "?"))
    if st != 200 or "token" not in res:
        sys.exit("Login failed (%s). Nothing was changed." % st)
    token = res["token"]
    me = res.get("user") or {}
    if me.get("role") not in ("owner", "supervisor"):
        sys.exit("%s is a %s — only an owner or supervisor may reset other accounts."
                 % (a.user, me.get("role")))
    print("  ok — %s (%s)\n" % (me.get("name"), me.get("role")))

    print("Set a new PIN for each account. Press Enter alone to leave one unchanged.\n")
    changed, skipped, used = [], [], set()
    for uid, name, role, published in SEEDED:
        print("%s  (%s, %s)" % (name, role, uid))
        new = ask_new_pin(uid, published, used)
        if new is None:
            print("  skipped\n")
            skipped.append((uid, published))
            continue
        used.add(new)
        st, res = call(base, "/auth/setpin", {"userId": uid, "pin": new}, token=token)
        del new
        if st != 200:
            print("  ! FAILED (%s): %s\n" % (st, res.get("error")))
            skipped.append((uid, published))
            continue
        print("  changed\n")
        changed.append((uid, published))

    if not changed:
        sys.exit("Nothing was changed.")

    # Prove it, without needing to know any new PIN: the PUBLISHED one must now be
    # rejected. One wrong attempt per account, well inside the 5-attempt lockout.
    print("Verifying that the published PINs no longer work…")
    bad = []
    for uid, published in changed:
        st, _ = call(base, "/auth/login", {"userId": uid, "pin": published})
        mark = "rejected" if st == 401 else ("STILL ACCEPTED" if st == 200 else "http %s" % st)
        if st != 401:
            bad.append(uid)
        print("  %-10s %s" % (uid, mark))

    print("\nChanged %d, skipped %d." % (len(changed), len(skipped)))
    if skipped:
        print("Still on their published PIN: " + ", ".join(u for u, _ in skipped))
        print("ENABLE_DEMO_SEED=0 will DELETE those accounts, not secure them.")
    if bad:
        sys.exit("\n%s did not actually change — do not set ENABLE_DEMO_SEED=0 yet."
                 % ", ".join(bad))
    if not skipped:
        print("\nAll seven rotated. ENABLE_DEMO_SEED=0 is now safe to set.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Set a new PIN for an owner account directly in the database.

    python3 -m pip install "psycopg[binary]"
    python3 scripts/reset-owner-pin.py

    python3 scripts/reset-owner-pin.py --sql      # no database URL needed

--sql is for when the connection string cannot be found (Vercel hides saved
values). It asks only for the new PIN and prints one SQL statement to paste into
the Supabase dashboard's SQL Editor, which needs nothing but your Supabase login.

The recovery path when the owner cannot sign in. No login can do this: a
supervisor may not reset an owner's PIN (that would be a way to become the
owner), so it goes straight to the database, which only the person holding the
database connection string can reach.

The connection string and the new PIN are typed at hidden prompts. Nothing is
passed as an argument, so neither reaches your shell history, the process list,
or a log. The new PIN also ends every session the account had open.
"""
import getpass
import hashlib
import os
import sys
import uuid

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


WEAK = {"1111", "2222", "3333", "0001", "0002", "0003", "0010", "1234", "4321", "0123"}


def ask_pin(label):
    while True:
        p1 = getpass.getpass("New 4-digit PIN for %s: " % label).strip()
        if not (len(p1) == 4 and p1.isdigit()):
            print("  Four digits, please.")
            continue
        if p1 in WEAK or len(set(p1)) == 1:
            print("  That PIN is too easy to guess, or is a published demo PIN. Choose another.")
            continue
        if getpass.getpass("Type it again: ").strip() != p1:
            print("  They did not match.")
            continue
        return p1


def sql_mode():
    uid = (input("Owner login id [u-owner]: ").strip() or "u-owner")
    if not uid.replace("-", "").replace("_", "").isalnum():
        sys.exit("That is not a login id. Nothing was printed.")
    pin = ask_pin(uid)
    salt = uuid.uuid4().hex
    digest = hashlib.sha256((salt + pin).encode()).hexdigest()   # same as hash_pin() in sync_server.py
    del pin
    print("\nOpen supabase.com → your project → SQL Editor → New query, paste ALL of this, and Run:\n")
    print("UPDATE users SET salt = '%s', pin_hash = '%s' WHERE id = '%s' AND role = 'owner';" % (salt, digest, uid))
    print("DELETE FROM loginfails WHERE k IN ('u:%s', '%s');" % (uid, uid))
    print("SELECT id, name, role FROM users WHERE id = '%s';" % uid)
    print("\nThe last line should show one row, your owner account. Then sign in with the new PIN.")
    print("Do not share the printed lines: together they are as good as the PIN.")


def main():
    if "--sql" in sys.argv:
        return sql_mode()
    print("Paste the production DATABASE_URL (Vercel → project → Settings → Environment")
    print("Variables, or Supabase → Connect). It is not shown and not stored.")
    url = getpass.getpass("  DATABASE_URL: ").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        sys.exit("That does not look like a Postgres connection string. Nothing was changed.")
    os.environ["DATABASE_URL"] = url
    os.environ.pop("ENABLE_DEMO_SEED", None)
    sys.path.insert(0, HERE)
    try:
        import sync_server as S
    except ModuleNotFoundError as e:
        sys.exit("Missing a library (%s). Run: python3 -m pip install \"psycopg[binary]\"" % e.name)

    c = S.db()
    owners = c.execute("SELECT id,name FROM users WHERE role='owner' ORDER BY id").fetchall()
    c.close()
    if not owners:
        sys.exit("No owner account exists in this database. Nothing was changed.")
    print("\nOwner accounts:")
    for i, (uid, name) in enumerate(owners, 1):
        print("  %d) %s  (%s)" % (i, name, uid))
    pick = input("Which one? [1]: ").strip() or "1"
    try:
        uid, name = owners[int(pick) - 1]
    except (ValueError, IndexError):
        sys.exit("Not one of the listed numbers. Nothing was changed.")

    p1 = ask_pin(name)

    if not S.set_pin(uid, p1):
        sys.exit("The account vanished while this ran. Nothing was changed.")
    # Clear any lockout from the failed attempts, so the new PIN works at once.
    c = S.db()
    c.execute("DELETE FROM loginfails WHERE k=? OR k=?", ("u:" + uid, uid))
    c.commit()
    c.close()
    ok = S.do_login(uid, p1) is not None
    del p1
    print("\n%s: PIN changed%s." % (name, " and verified" if ok else " — but the check sign-in FAILED, tell someone"))
    print("Every session this account had open has ended. Sign in on your phone with the new PIN.")


if __name__ == "__main__":
    main()

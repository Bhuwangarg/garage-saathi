#!/usr/bin/env python3
"""A rotated PIN must actually stop working, everywhere.

Guards two properties that are easy to break and expensive to get wrong:

1. /auth/login reports whether it HOLDS the account it just rejected. Without
   that flag the client cannot tell "wrong PIN" from "account lives only on the
   device", so it falls back to its cached PIN in both cases — and a rotated
   credential keeps working on every phone that ever used the old one.

2. purge_demo_users() removes exactly the seeded accounts still on their
   published PIN, and keeps the rotated ones. Setting ENABLE_DEMO_SEED=0 before
   rotating therefore DELETES those accounts rather than securing them, which is
   why rotate-pins.py must run first.

    /usr/bin/python3 test_pin_rotation.py
"""
import json
import os
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
os.environ["ENABLE_DEMO_SEED"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sync_server as S  # noqa: E402

PORT = int(os.environ.get("TEST_PORT", "8799"))
FAILS = []


def check(label, cond):
    print("  %s  %s" % ("ok " if cond else "FAIL", label))
    if not cond:
        FAILS.append(label)


def login(uid, pin):
    req = urllib.request.Request("http://127.0.0.1:%d/auth/login" % PORT,
                                 data=json.dumps({"userId": uid, "pin": pin}).encode(),
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    from http.server import HTTPServer
    S.bootstrap()
    srv = HTTPServer(("127.0.0.1", PORT), S.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.4)

    print("Phase 1 — a rejection says whether the server knows the account")
    st, b = login("u-owner", "1111")
    check("seeded PIN logs in", st == 200 and "user" in b)
    st, b = login("u-owner", "9876")
    check("wrong PIN on a real account -> 401 known=True", st == 401 and b.get("known") is True)
    st, b = login("u-nosuchperson", "0000")
    check("unknown account -> 401 known=False", st == 401 and b.get("known") is False)

    print("Phase 2 — rotation takes effect")
    check("set_pin succeeds", S.set_pin("u-owner", "8642"))
    st, b = login("u-owner", "1111")
    check("old PIN refused, still known=True", st == 401 and b.get("known") is True)
    st, b = login("u-owner", "8642")
    check("new PIN works", st == 200 and "user" in b)

    print("Phase 3 — the purge keeps rotated accounts and removes unrotated ones")
    removed = set(S.purge_demo_users())
    check("rotated owner survives", "u-owner" not in removed)
    check("unrotated accounts removed", {"u-sup", "u-store", "u-m1"} <= removed)

    print("\nRESULT: " + ("ALL PASS" if not FAILS else "%d FAILED" % len(FAILS)))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())

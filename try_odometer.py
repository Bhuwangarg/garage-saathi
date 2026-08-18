#!/usr/bin/env python3
"""Try the odometer flow on a real dashboard photo — no WhatsApp needed.

The WhatsApp Business account gates DELIVERY, not the part that carries the risk.
Whether a model can read a bus cluster at night, through dust, at an angle, is the
assumption the whole flow rests on, and it can be measured now. If the read rate
is poor, no amount of Meta onboarding fixes it — better to know first.

Usage:
    python3 try_odometer.py --pin 1111 photo1.jpg photo2.jpg ...
    python3 try_odometer.py --pin 1111 --phone 9828949520 photo.jpg
    python3 try_odometer.py --server http://localhost:8766 --pin 1111 photo.jpg

Each photo is sent through the same path a WhatsApp image would take: the same
OCR call, the same validation, the same write. Pass --dry to read the meter
without writing anything to the fleet record.
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request

DEFAULT_SERVER = "https://garage-saathi-sync.onrender.com"


def post(server, path, payload, token=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    req = urllib.request.Request(server.rstrip("/") + path,
                                 data=json.dumps(payload).encode(),
                                 method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="+")
    ap.add_argument("--server", default=os.environ.get("GS_SERVER", DEFAULT_SERVER))
    ap.add_argument("--user", default="u-owner")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--phone", help="crew phone to attribute the reading to; "
                                    "defaults to the first bus that has one")
    ap.add_argument("--dry", action="store_true", help="read only, write nothing")
    a = ap.parse_args()

    status, body = post(a.server, "/auth/login", {"userId": a.user, "pin": a.pin})
    if status != 200 or not body.get("token"):
        print(f"login failed ({status}): {body.get('error') or body}")
        return 1
    token = body["token"]
    print(f"signed in as {a.user}\n")

    phone = a.phone
    if not phone:
        print("no --phone given; pass the crew number of the bus you are testing")
        return 1

    ok = held = unread = 0
    for path in a.photos:
        if not os.path.exists(path):
            print(f"  {os.path.basename(path):<28} file not found")
            continue
        mime = mimetypes.guess_type(path)[0] or "image/jpeg"
        with open(path, "rb") as f:
            data_url = f"data:{mime};base64," + base64.b64encode(f.read()).decode()

        status, res = post(a.server, "/odometer/submit",
                           {"phone": phone, "image": data_url, "dry": bool(a.dry)}, token)
        name = os.path.basename(path)
        if status != 200:
            print(f"  {name:<28} HTTP {status}: {res.get('error')}")
            continue
        st = res.get("status")
        if st == "accepted":
            ok += 1
            print(f"  {name:<28} ✓ {res.get('bus')}  {res.get('km'):,} km")
        elif st == "held":
            held += 1
            print(f"  {name:<28} ⏸ held — {res.get('km'):,} km  ({res.get('reply')})")
        elif st == "unreadable":
            unread += 1
            print(f"  {name:<28} ✗ could not read  (model said: {res.get('raw')!r})")
        else:
            print(f"  {name:<28} {st}: {res.get('reply')}")

    total = ok + held + unread
    if total:
        print(f"\nread {ok + held}/{total} photos ({100 * (ok + held) // total}%), "
              f"{unread} unreadable, {held} held for review")
        print("A read rate below ~90% means the prompt or the model needs work "
              "before drivers are asked to rely on it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

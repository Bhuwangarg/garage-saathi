"""Tests for the WhatsApp client ported from the Zappie codebase.

Focused on the rules that fail SILENTLY in production rather than raising:
a free-form send outside the 24h service window is rejected by Meta and repeated
retries downgrade the sender's quality rating; a delivery receipt arriving out of
order can walk a message's status backwards from 'read' to 'sent'.

All pure functions — no network, no WhatsApp account needed.

Run: python3 test_wa_client.py
"""
import sys

import wa_client as W

fails = []


def check(name, cond):
    print(("  ok  " if cond else "  FAIL ") + name)
    if not cond:
        fails.append(name)


NOW = 1_760_000_000_000
HOUR = 60 * 60 * 1000

print("\n--- the 24-hour service window ---")
check("never messaged us -> template only", W.can_send_freeform(None, NOW) is False)
check("wrote 1 hour ago -> free-form ok", W.can_send_freeform(NOW - HOUR, NOW) is True)
check("wrote 23h ago -> still open", W.can_send_freeform(NOW - 23 * HOUR, NOW) is True)
check("wrote 25h ago -> window SHUT", W.can_send_freeform(NOW - 25 * HOUR, NOW) is False)
check("exactly 24h -> shut (boundary is exclusive)",
      W.can_send_freeform(NOW - 24 * HOUR, NOW) is False)
check("zero timestamp treated as never", W.can_send_freeform(0, NOW) is False)

print("\n--- delivery status never regresses ---")
check("queued -> sent advances", W.status_should_update("queued", "sent") is True)
check("sent -> delivered advances", W.status_should_update("sent", "delivered") is True)
check("read -> sent does NOT regress", W.status_should_update("read", "sent") is False)
check("delivered -> read advances", W.status_should_update("delivered", "read") is True)
check("failed -> delivered does NOT un-fail", W.status_should_update("failed", "delivered") is False)
check("failed -> failed still allowed", W.status_should_update("failed", "failed") is True)
check("unknown status does not crash", W.status_should_update("weird", "alsoweird") in (True, False))

print("\n--- webhook signature ---")
BODY = b'{"entry":[]}'
SECRET = "s3cret"
import hashlib, hmac  # noqa: E402
good = "sha256=" + hmac.new(SECRET.encode(), BODY, hashlib.sha256).hexdigest()
check("valid signature passes", W.verify_signature(BODY, good, SECRET) is True)
check("wrong signature fails", W.verify_signature(BODY, "sha256=deadbeef", SECRET) is False)
check("missing header fails when a secret is set", W.verify_signature(BODY, None, SECRET) is False)
check("no secret configured -> no check", W.verify_signature(BODY, None, "") is True)
check("tampered body fails", W.verify_signature(b'{"entry":[1]}', good, SECRET) is False)

print("\n--- webhook parsing ---")
PAYLOAD = {"entry": [{"changes": [{"field": "messages", "value": {
    "metadata": {"phone_number_id": "123"},
    "messages": [{"from": "919876543210", "id": "wamid.X", "type": "image",
                  "image": {"id": "MEDIA1", "mime_type": "image/jpeg", "caption": "meter"}}],
    "statuses": [],
}}]}]}
entries = W.extract_entries(PAYLOAD)
check("one change -> one entry", len(entries) == 1)
check("phone_number_id carried through", entries[0]["phone_number_id"] == "123")
check("empty payload does not crash", W.extract_entries({}) == [])
check("None payload does not crash", W.extract_entries(None) == [])

m = W.normalize_message(PAYLOAD["entry"][0]["changes"][0]["value"]["messages"][0])
check("image type detected", m["type"] == "image")
check("media id extracted (what OCR needs)", m["media_id"] == "MEDIA1")
check("sender extracted", m["from"] == "919876543210")
check("caption kept as text", m["text"] == "meter")

t = W.normalize_message({"from": "91999", "id": "w1", "type": "text", "text": {"body": "hi"}})
check("text message body extracted", t["text"] == "hi" and t["media_id"] is None)

b = W.normalize_message({"from": "91999", "id": "w2", "type": "button",
                         "button": {"text": "Yes", "payload": "y"}})
check("button reply text extracted", b["text"] == "Yes")

i = W.normalize_message({"from": "91999", "id": "w3", "type": "interactive",
                         "interactive": {"button_reply": {"title": "Confirm"}}})
check("interactive reply title extracted", i["text"] == "Confirm")

check("unknown type degrades safely", W.normalize_message({"type": "reaction"})["type"] == "reaction")
check("empty message does not crash", W.normalize_message({})["type"] == "text")

print("\nRESULT: " + ("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)

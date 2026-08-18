"""WhatsApp Cloud API client — stdlib only, no framework, no database.

Ported from the Zappie codebase's `services/whatsapp.py`, which is a FastAPI +
httpx + SQLAlchemy application. None of that could come across; what came across
is the knowledge encoded in it, re-expressed against urllib so it drops into the
single-file server without adding a dependency.

The most valuable thing carried over is the SERVICE WINDOW rule, which is easy to
not know about and expensive to discover in production: Meta only permits
free-form messages within 24 hours of the recipient's last inbound message.
Outside that window a business-initiated message MUST use a pre-approved
template, or it is rejected and repeated attempts damage the sender's quality
rating. A shift-end odometer prompt is business-initiated by definition, so it is
template-only for any driver who has not messaged in the last day.

Everything here is a pure function or a single HTTP call, so it is testable
without a WhatsApp account.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request

GRAPH_BASE = "https://graph.facebook.com"
GRAPH_VERSION = "v21.0"
SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

# Delivery states are monotonic: a webhook may deliver them out of order, and a
# later 'sent' must never overwrite an earlier 'read'. Failure is terminal.
_STATUS_RANK = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 5}


class WAError(Exception):
    pass


def _url(path):
    return f"{GRAPH_BASE}/{GRAPH_VERSION}/{str(path).lstrip('/')}"


def _request(method, path, token, payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(_url(path), data=data, method=method, headers={
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        # Meta puts the actionable reason in the body, not the status line —
        # "template not approved" and "outside service window" are both 400.
        try:
            detail = json.loads(e.read() or b"{}").get("error", {}).get("message", "")
        except Exception:
            detail = ""
        raise WAError(f"HTTP {e.code}: {detail or 'request failed'}")
    except Exception as e:
        raise WAError(str(e) or "unreachable")


# ------------------------------- outbound ----------------------------------

def send_text(token, phone_id, to, body):
    """Free-form text. Only valid INSIDE the service window — see can_send_freeform."""
    return _request("POST", f"{phone_id}/messages", token, {
        "messaging_product": "whatsapp", "recipient_type": "individual",
        "to": to, "type": "text", "text": {"body": body},
    })


def send_template(token, phone_id, to, name, language="en", body_params=None):
    """Pre-approved template. The only thing that reaches a recipient outside the
    24h window, and the only legitimate way to start a conversation."""
    components = []
    if body_params:
        components.append({"type": "body", "parameters": [
            {"type": "text", "text": str(p)} for p in body_params]})
    return _request("POST", f"{phone_id}/messages", token, {
        "messaging_product": "whatsapp", "recipient_type": "individual",
        "to": to, "type": "template",
        "template": {"name": name, "language": {"code": language},
                     "components": components},
    })


def mark_read(token, phone_id, wa_message_id):
    """Cheap courtesy: the driver sees their photo was received while OCR runs."""
    try:
        return _request("POST", f"{phone_id}/messages", token, {
            "messaging_product": "whatsapp", "status": "read",
            "message_id": wa_message_id,
        })
    except WAError:
        return None


# ------------------------------- inbound -----------------------------------

def media_data_url(token, media_id, timeout=45):
    """Resolve an inbound media id to a data URL.

    Two hops, and the second one still needs the bearer token — the URL Meta
    returns is not public and 401s without it. This is the piece the Zappie
    codebase did not have: it recorded the media id but never fetched the bytes,
    which is fine for an inbox that renders attachments on demand and useless for
    OCR that needs the image now.
    """
    meta = _request("GET", str(media_id), token, timeout=timeout)
    url = meta.get("url")
    if not url:
        raise WAError("media has no url")
    req = urllib.request.Request(url, headers={"authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except Exception as e:
        raise WAError(f"media fetch failed: {e}")
    mime = meta.get("mime_type") or "image/jpeg"
    return "data:" + mime + ";base64," + base64.b64encode(raw).decode()


def verify_signature(raw_body, signature_header, secret):
    """Validate X-Hub-Signature-256. No secret configured means no check — that is
    a deployment choice, not a silent pass on a configured secret."""
    if not secret:
        return True
    if not signature_header:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def extract_entries(payload):
    """Flatten the entry[].changes[].value nesting into one list per change."""
    out = []
    for entry in (payload or {}).get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {}) or {}
            meta = value.get("metadata", {}) or {}
            out.append({
                "field": change.get("field", "messages"),
                "phone_number_id": meta.get("phone_number_id"),
                "messages": value.get("messages", []) or [],
                "statuses": value.get("statuses", []) or [],
                "contacts": value.get("contacts", []) or [],
            })
    return out


def normalize_message(msg):
    """Reduce an inbound message to what a handler needs: type, sender, id, text
    and — for media — the id to fetch."""
    mtype = str((msg or {}).get("type") or "text").strip().lower()
    out = {"type": mtype, "from": msg.get("from"), "id": msg.get("id"),
           "timestamp": msg.get("timestamp"), "text": "", "media_id": None, "mime": None}
    if mtype == "text":
        out["text"] = str((msg.get("text") or {}).get("body") or "")
    elif mtype in ("image", "document", "video", "audio", "sticker"):
        media = msg.get(mtype) or {}
        out["media_id"] = media.get("id")
        out["mime"] = media.get("mime_type")
        out["text"] = str(media.get("caption") or "")
    elif mtype == "button":
        out["text"] = str((msg.get("button") or {}).get("text") or "")
    elif mtype == "interactive":
        inter = msg.get("interactive") or {}
        reply = inter.get("button_reply") or inter.get("list_reply") or {}
        out["text"] = str(reply.get("title") or "")
    return out


# ------------------------------ send policy --------------------------------

def can_send_freeform(last_inbound_ms, now_ms):
    """True while the 24h service window is open.

    This is the rule that makes an outbound prompt work or silently fail. A
    scheduled shift-end message to a driver who last wrote 30 hours ago is
    rejected, and retrying it repeatedly is what gets a sender's quality rating
    downgraded — so callers must branch on this rather than send and hope.
    """
    if not last_inbound_ms:
        return False
    return (now_ms - int(last_inbound_ms)) < SERVICE_WINDOW_MS


def status_should_update(current, incoming):
    """Delivery receipts arrive out of order. Never regress, never un-fail."""
    cur = str(current or "queued").lower()
    inc = str(incoming or "sent").lower()
    if cur == "failed" and inc != "failed":
        return False
    return _STATUS_RANK.get(inc, 1) >= _STATUS_RANK.get(cur, 0)

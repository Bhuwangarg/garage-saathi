"""Do a gate check's photos show what they claim? (AI sweep #2, 18 Oct 2026)

The gate check makes the driver photograph the AC, the blankets and the cabin before a bus leaves,
because those are what passengers complain about. Nobody looks at the photos: a picture of the
floor passes. Claude now looks at each one and says whether it shows the item: "ok", "doubt"
(it might, but it is dark, blurred, too close, or shows only part), or "wrong" (it is not that at
all). The code adds one check of its own: the same photo used for two items, or again from an
earlier check.

Nothing is decided from this: the office sees the flags beside the photos. Claude is told never to
identify or describe people. Standard library only; the HTTP call is passed in.
"""
import hashlib
import re

PROMPT_V = 1
PHOTO_ITEMS = ("ac", "blankets", "cabin")
WHAT = {
    "ac": "the bus's air conditioning: the AC control panel or display showing it on, or the AC vents/ducts "
          "inside the bus. A thermometer or a phone screen showing a temperature also counts.",
    "blankets": "sleeper berths with a folded blanket and a pillow on them, inside the bus.",
    "cabin": "the inside of the bus: berths or seats and the aisle floor, clean and without litter.",
}
VERDICTS = ("ok", "doubt", "wrong")

SYSTEM = """You check the photos an Indian sleeper-bus driver takes before departure, as proof that \
the bus is ready. For each photo you are told what it must show. Answer per photo:
- verdict "ok": it clearly shows that.
- "doubt": it may show it but you cannot tell (too dark, blurred, too close, only part of it, \
or the item looks not ready: blankets missing or unfolded, litter on the floor).
- "wrong": it does not show that at all (the floor or a wall only, outside the bus, a screen \
showing something else, a photo of a photo, a blank or black frame).
- reason: at most 12 English words on what you see. hi: the same in at most 12 Hindi words.
Judge only the bus and the item. Never identify, name or describe any person in a photo.
Always answer by calling record_photos once, with an item for every photo. Write nothing else."""

TOOL = {
    "name": "record_photos",
    "description": "Record the verdict for every photo given, by its key.",
    "input_schema": {
        "type": "object",
        "properties": {"items": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "k": {"type": "string", "enum": list(PHOTO_ITEMS)},
                "verdict": {"type": "string", "enum": list(VERDICTS)},
                "reason": {"type": "string"},
                "hi": {"type": "string"},
            },
            "required": ["k", "verdict", "reason", "hi"],
        }}},
        "required": ["items"],
    },
}


def photos_of(check):
    """{item: photo} for the photo items that have one."""
    items = (check or {}).get("items") or {}
    return {k: (items.get(k) or {}).get("photo") for k in PHOTO_ITEMS if (items.get(k) or {}).get("photo")}


def photos_hash(photos):
    return hashlib.sha1("|".join("%s=%s" % (k, photos[k][:200] + str(len(photos[k]))) for k in sorted(photos)).encode()).hexdigest()[:16]


def is_submitted(check):
    """Only checks the driver has finished: an open one may still get new photos."""
    return (check or {}).get("status") in ("released", "awaiting", "approved", "held") and not check.get("_deleted")


def duplicates(check, earlier):
    """The code's own check: {item: what it repeats}. `earlier` is {photo: (checkId, item)} from other checks."""
    out, seen = {}, {}
    for k, p in photos_of(check).items():
        if p in seen:
            out[k] = {"sameAs": seen[p]}
        elif p in earlier and earlier[p][0] != check.get("id"):
            out[k] = {"sameAsCheck": earlier[p][0], "item": earlier[p][1]}
        seen.setdefault(p, k)
    return out


_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", re.S)


def image_block(photo):
    m = _DATA_URL.match(photo or "")
    if m:
        return {"type": "image", "source": {"type": "base64", "media_type": m[1], "data": m[2]}}
    if str(photo or "").startswith("https://"):
        return {"type": "image", "source": {"type": "url", "url": photo}}
    return None


def params_for(check, model):
    content, keys = [], []
    for k, p in photos_of(check).items():
        block = image_block(p)
        if not block:
            continue
        content += [{"type": "text", "text": "Photo %s: must show %s" % (k, WHAT[k])}, block]
        keys.append(k)
    if not keys:
        return None, []
    return {"model": model, "max_tokens": 1500, "system": SYSTEM, "tools": [TOOL], "tool_choice": {"type": "auto"},
            "messages": [{"role": "user", "content": content}]}, keys


def parse_message(msg, keys):
    out = {}
    for block in (msg or {}).get("content") or []:
        if block.get("type") != "tool_use" or block.get("name") != "record_photos":
            continue
        for x in (block.get("input") or {}).get("items") or []:
            if isinstance(x, dict) and x.get("k") in keys and x.get("verdict") in VERDICTS:
                out[x["k"]] = {"verdict": x["verdict"], "reason": str(x.get("reason") or "")[:120], "hi": str(x.get("hi") or "")[:120]}
    return out

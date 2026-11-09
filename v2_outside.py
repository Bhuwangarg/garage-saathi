"""The outside-repair rules, as pure functions (contract 6, 4.3, 5, 7).

No connection, no clock, no I/O: the caller hands in everything a rule needs
(the stored record, the passes of a card) and takes a reason back. That is the
reason this is a module of its own, the way v2_perms is -- the rules should be
readable by somebody who is not reading a 6,700-line server, and their tests need
no database.

`guard_*` return a reason to refuse or None to allow, and may rewrite `data` in
place to stamp server truth over what the body claimed, exactly as `_guard_write`
does. The strings are contract 6.3 verbatim: they are what a person reads in the
quarantine toast.
"""
import v2_perms

# Consumed, never restated: two copies of a permission rule are how they drift.
OUTSIDE_SET = v2_perms.OUTSIDE_CARD_FIELDS

MAX_BILL_PHOTOS = 4

# Contract 6.3. One place, so a test can compare the server against the contract
# instead of against itself.
R_NOT_MANAGER = "only an owner or supervisor may mark a bus away or set the outside cost"
R_PHOTOS = "at most 4 bill photos on a job card"
R_REASON_FROZEN = "the reason a card closed without a bill cannot be rewritten"
R_NO_BUS = "a gate pass must name a bus"
R_NO_VENDOR_UNIT = "a gate pass must name the vendor and the unit"
R_MOVED = "a gate pass cannot be moved to another bus"
R_ALREADY_RETURNED = "this gate pass is already returned"
R_MANAGER_CORRECTS = "a returned gate pass is a manager's to correct"
R_UNRETURN = "a gate pass cannot be un-returned"
R_NO_DELETE = "a gate pass cannot be deleted"
R_NEEDS_BILL = "a job card needs the vendor's bill, or a reason typed in, to close"
# Contract 6.2 says "status must be out or returned" and gives no string for it.
R_BAD_STATUS = "a gate pass is either out or returned"

CLOSED = ("done", "verified")

# Copied at issue and frozen after it: the paper in the vendor's file cannot
# change because a bus record was corrected next month (contract 6.2).
FROZEN = ("no", "busId", "jobId", "componentId", "regNo", "engineNo", "chassisNo",
          "issuedBy", "issuedAt")
# What a return writes. A non-manager's different value in any of these is a
# second return; a different value elsewhere is an edit to a returned pass.
RETURN_FIELDS = ("returnedAt", "returnSerial", "cost", "returnRemark", "billPhoto")
# Stamped or derived by the server, so never compared against the body.
SERVER_TRUTH = ("issuedBy", "returnedBy", "serialMismatch")
_STAMPS = ("updatedAt", "_by", "_byRole", "_org", "_createdBy", "_createdRole")


def norm_serial(s):
    """Upper-case, spaces and hyphens removed -- the published table, contract 4.1."""
    return "".join(ch for ch in str(s or "").upper() if ch not in " -")


def _empty(v):
    return v is None or v == "" or v == [] or v is False or v == 0


def _same(a, b):
    """Values compared the way a carry-over needs: an empty value and an absent one
    are the same statement ("no outside work"), so a v1 card that writes
    `externalVendor: ""` back over a card that never had the field is not a change."""
    if _empty(a) and _empty(b):
        return True
    return a == b


def guard_jobcard_outside(data, actor, old):
    """Contract 6.1. The outside set is the owner's and the supervisor's, on EVERY
    card state -- the old rule froze it only on an already-verified card, so a
    mechanic's phone could mark a bus away on an open one.

    Compares VALUES: a storekeeper attaching a part sends the whole card back with
    the outside fields unchanged, and refusing that would break part issuing on an
    outside card. A field missing from the body means KEEP, not clear -- that is
    what stops a v2 write erasing v1's outsideLat/outsideLng, and the carry-over
    itself is `_merge_stale_fields`, which runs after this."""
    old = old or {}
    role = actor.get("role")
    if not v2_perms.may_set_outside(role):
        was_closed = old.get("status") in CLOSED
        if (was_closed and "closeNoBillReason" in data
                and not _same(data.get("closeNoBillReason"), old.get("closeNoBillReason"))):
            return R_REASON_FROZEN
        for f in sorted(OUTSIDE_SET):
            if f in data and not _same(data.get(f), old.get(f)):
                return R_NOT_MANAGER
    photos = data.get("billPhotos")
    if isinstance(photos, list) and len(photos) > MAX_BILL_PHOTOS:
        return R_PHOTOS
    return None


def is_outside(d):
    return bool(d.get("outside")) or bool(d.get("externalVendor"))


def has_proof(data, passes_of_card):
    """Contract 7: may this card close? `passes_of_card` is the card's gate passes
    (any status); only a returned one with a bill counts."""
    if is_outside(data):
        if data.get("billPhotos"):
            return True
        if str(data.get("closeNoBillReason") or "").strip():
            return True
        return any(isinstance(p, dict) and p.get("status") == "returned" and p.get("billPhoto")
                   for p in passes_of_card or [])
    return bool(data.get("beforePhotos")) and bool(data.get("afterPhotos"))


def external_cost_of(passes_of_card):
    """Contract 5: the sum of `cost` over the card's RETURNED passes, or None when
    none of them carries a figure (null, never 0, when nothing is known). The
    caller sets the card's externalCost to it -- setting, never adding -- so a
    replay cannot double the vendor's charge and two returns cannot clobber."""
    total, known = 0.0, False
    for p in passes_of_card or []:
        if not isinstance(p, dict) or p.get("status") != "returned" or p.get("_deleted"):
            continue
        cost = p.get("cost")
        if isinstance(cost, (int, float)) and not isinstance(cost, bool):
            total += cost
            known = True
    return total if known else None


def guard_gatepass(data, actor, old):
    """Contract 6.2: the one-way machine, the required fields, the frozen
    identifiers, who did it from the token, and the derived mismatch."""
    old = old or {}
    uid = actor.get("id")
    manager = actor.get("role") in v2_perms.MANAGERS

    if data.get("_deleted"):
        return R_NO_DELETE
    status = data.get("status")
    if status not in ("out", "returned"):
        return R_BAD_STATUS

    if not old:
        if not str(data.get("busId") or "").strip():
            return R_NO_BUS
        if not str(data.get("vendorName") or "").strip() or not str(data.get("unitName") or "").strip():
            return R_NO_VENDOR_UNIT
        data["issuedBy"] = uid
    else:
        if old.get("status") == "returned" and status == "out":
            return R_UNRETURN
        for f in FROZEN:
            if f in data and not _same(data.get(f), old.get(f)):
                return R_MOVED
        # The identifiers are not the body's to restate; an issuer is whoever the
        # token said on the day. A v1-written pass with none keeps none.
        for f in FROZEN:
            if f in old:
                data[f] = old[f]
        if "issuedBy" not in old:
            data.pop("issuedBy", None)
        if old.get("status") == "returned" and not manager:
            keys = (set(data) | set(old)) - set(_STAMPS) - set(SERVER_TRUTH)
            keys = {k for k in keys if k in data}      # a field the body omits is KEPT
            diff = {k for k in keys if not _same(data.get(k), old.get(k))}
            if diff & set(RETURN_FIELDS):
                return R_ALREADY_RETURNED
            if diff:
                return R_MANAGER_CORRECTS
            # Byte-identical replay: nothing differs, so it is applied. Server
            # truth is put back below, so the stored record does not move.

    if status == "returned":
        if old.get("status") == "returned" and "returnedBy" in old:
            data["returnedBy"] = old["returnedBy"]
        else:
            data["returnedBy"] = uid
        serial = data["unitSerial"] if "unitSerial" in data else old.get("unitSerial")
        # No paper to disagree with when the unit never carried a number.
        data["serialMismatch"] = bool(norm_serial(serial)) and (
            norm_serial(data.get("returnSerial")) != norm_serial(serial))
    else:
        data.pop("returnedBy", None)
        data.pop("serialMismatch", None)
    return None


def history_key(el):
    """How two history entries are judged to be the same event: by entry id, and
    for entries written before ids existed (v1's) by (type, at)."""
    if isinstance(el, dict) and el.get("id"):
        return ("id", el["id"])
    if isinstance(el, dict):
        return ("ta", el.get("type"), el.get("at"))
    return ("raw", repr(el))


def merge_history(old_history, new_history):
    """Union by entry id, then (type, at). The incoming copy wins a collision and
    nothing is dropped or reordered -- a missing entry is a device that loaded the
    piece before it was written, not a removal."""
    merged = list(new_history or [])
    seen = {history_key(el) for el in merged}
    for el in old_history or []:
        k = history_key(el)
        if k not in seen:
            merged.append(el)
            seen.add(k)
    return merged


def derive_refurb_count(history):
    """Contract 4.3: the number of `return` entries. Derived rather than
    incremented, so a replay cannot count a refurbishment twice."""
    return sum(1 for el in history or [] if isinstance(el, dict) and el.get("type") == "return")

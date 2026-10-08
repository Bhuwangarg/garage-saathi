#!/usr/bin/env python3
"""Uploads: crew documents may be pictures or PDFs, and nothing else.

The label on a data URL is whatever the phone (or an attacker) wrote, so the
server decides by the first bytes of the file.

    /usr/bin/python3 test_uploads.py
"""
import base64, os, sys, tempfile

os.environ["DB_PATH"] = tempfile.mktemp(suffix=".db")
for k in ("DATABASE_URL", "TURSO_URL", "TURSO_DATABASE_URL", "R2_ACCOUNT_ID", "R2_BUCKET"):
    os.environ.pop(k, None)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sync_server as S  # noqa: E402

S._USE_R2 = False
S.UPLOADS = tempfile.mkdtemp()
fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


def durl(label, raw):
    return "data:%s;base64,%s" % (label, base64.b64encode(raw).decode())


def saved(res):
    if "url" not in res:
        return None
    path = os.path.join(S.UPLOADS, res["url"].rsplit("/", 1)[-1])
    return path if os.path.isfile(path) else None


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"

r = S.save_upload(durl("image/jpeg", JPEG), "host", "https")
check("a camera JPEG is stored as .jpg", r.get("url", "").endswith(".jpg") and saved(r))
r = S.save_upload(durl("image/png", PNG), "host", "https")
check("a PNG is stored as .png", r.get("url", "").endswith(".png") and saved(r))
r = S.save_upload(durl("application/pdf", PDF), "host", "https")
pdf_url = r.get("url", "")
check("a PDF licence is stored as .pdf", pdf_url.endswith(".pdf") and saved(r))
check("the stored PDF is byte-identical", saved(r) and open(saved(r), "rb").read() == PDF)
r = S.save_upload(durl("application/octet-stream", PDF), "host", "https")
check("a PDF with no type from the picker is still a PDF", r.get("url", "").endswith(".pdf"))

r = S.save_upload(durl("image/jpeg", b"<html><script>alert(1)</script></html>"), "host", "https")
check("HTML labelled as a JPEG is refused", "error" in r and "url" not in r)
r = S.save_upload(durl("application/pdf", b"MZ\x90\x00" + b"\x00" * 32), "host", "https")
check("an executable labelled as a PDF is refused", "error" in r)
r = S.save_upload("data:image/jpeg;base64,@@not base64@@", "host", "https")
check("broken base64 is refused", "error" in r)
check("nothing refused was written", len(os.listdir(S.UPLOADS)) == 4)

check("a replaced PDF can be deleted", S.delete_uploads([pdf_url]) == 1)
check("names outside the generated pattern are never deleted",
      S.delete_uploads(["https://host/uploads/" + "a" * 32 + ".html"]) == 0)
check("every stored kind has a content type", S.UPLOAD_CTYPES == {"jpg": "image/jpeg", "png": "image/png", "pdf": "application/pdf"})

# A server that cannot store a photo must say so, not crash the request.
S.UPLOADS = "/proc/nowhere-read-only/uploads"
r = S.save_upload(durl("image/jpeg", JPEG), "host", "https")
check("an unwritable store returns an error, not an exception", "error" in r and r.get("storage") is True)
check("the message names the problem", "storage unavailable" in r.get("error", ""))

# The R2 probe reports configuration without touching credentials.
S._USE_R2 = False
check("the probe says when R2 is not configured", S.r2_probe() == {"configured": False})
S._USE_R2 = True
# Well-formed settings, so the probe gets as far as the network.
S.R2_ACCOUNT_ID = "a" * 32
S.R2_BUCKET = "garage-saathi-photos"
S._R2_PROBE.update(at=0, ok=None, err=None, detail=None)


def boom(*a, **k):
    raise RuntimeError("no network")


S._r2_client = boom
probe = S.r2_probe()
check("a failing bucket is reported, with the error class only",
      probe.get("configured") is True and probe.get("ok") is False and probe.get("error") == "RuntimeError")
check("the result is cached", S.r2_probe()["error"] == "RuntimeError")
S._USE_R2 = False

# A truncated account id is a config mistake, not a network failure.
S._USE_R2 = True
S.R2_ACCOUNT_ID = "d5bb2c74d5b53e74e93f19d241327bc"   # 31 chars: one short
S.R2_BUCKET = "garage-saathi-photos"
S._R2_PROBE.update(at=0, ok=None, err=None, detail=None)
p2 = S.r2_probe()
check("a 31-character account id is named as the problem",
      p2.get("error") == "config" and "32 hex" in (p2.get("hint") or "") and "31 characters" in p2.get("hint"))
S.R2_ACCOUNT_ID = "0" * 32
S._R2_PROBE.update(at=0, ok=None, err=None, detail=None)
check("a well-formed id is left to the network to judge", S.r2_probe().get("error") != "config")
S.R2_ACCOUNT_ID = ""
S._R2_PROBE.update(at=0, ok=None, err=None, detail=None)
check("a missing account id is named too", "not set" in (S.r2_probe().get("hint") or ""))
S._USE_R2 = False

print("\nRESULT: " + ("ALL PASS" if not fails else "%d FAILED -> %s" % (len(fails), fails)))
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""Garage Saathi — dev sync + auth + file server.

A tiny shared "cloud" so multiple devices reconcile their data, now with:
  - Accounts:  server-side users with salted+hashed PINs and login tokens.
  - Auth:      /push, /pull and /upload require a valid Bearer token (401 otherwise).
  - Photos:    /upload stores image bytes as files; only the URL syncs in records.

Conflict rule stays last-write-wins by the client's `updatedAt`. This exists to
DEMONSTRATE the production architecture locally; swap for Supabase / hosted Node
(same endpoints) for real deployment.

Run:  python3 sync_server.py        (listens on 0.0.0.0:8766)
"""
import base64
import hashlib
import hmac
import secrets as _secrets
import json
import math
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import crew_trace
import advisor_ai
import bill_ai
import digest_ai
import coach_ai
import core_ai
import gate_ai
import name_ai
import report_ai
import review_ai
import wa_client
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, urlencode

DB = os.environ.get("DB_PATH", "sync.db")
UPLOADS = os.environ.get("UPLOADS_DIR", "uploads")
# Free persistence: point at a Turso (libSQL) database when these are set.
# Same SQL — Turso *is* SQLite — so nothing else in the server changes.
# Accept either our name or Turso's conventional TURSO_DATABASE_URL.
TURSO_URL = os.environ.get("TURSO_URL", "") or os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")
# Postgres (Supabase). Takes precedence over everything else when set: it is the
# only option here that is durable without a paid disk.
DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
_USE_PG = bool(DATABASE_URL)
_USE_TURSO = bool(TURSO_URL and TURSO_TOKEN) and not _USE_PG
# Is the SQLite file on a mounted disk that survives a redeploy? Nothing mounts one
# on the current (serverless) host, so this stays false there unless a deployment
# explicitly mounts /data or sets DB_DISK_PERSISTENT=1. Without this the
# disk-backed path reports itself as ephemeral and looks like data loss waiting
# to happen, which is how Turso got added in the first place.
_DISK_PERSISTENT = (os.environ.get("DB_DISK_PERSISTENT", "") == "1"
                    or os.path.dirname(os.path.abspath(DB)) == "/data")
# Serving an EMPTY database is worse than serving nothing: staff log in, do a
# day's work, and it lands somewhere that is not the source of truth. So when
# Turso is configured and unreachable we refuse to start rather than fall back.
# Set ALLOW_SQLITE_FALLBACK=1 only as a deliberate emergency override.
_ALLOW_FALLBACK = os.environ.get("ALLOW_SQLITE_FALLBACK", "") == "1"


class DatabaseUnavailable(RuntimeError):
    pass


# Persistence has to be OBSERVED, not inferred. Reporting `persistent: true`
# because DB_PATH starts with /data says nothing about whether a disk is mounted
# there — an unmounted /data is ordinary container storage that resets on every
# restart, and the server cannot tell the difference from the path alone.
#
# So each boot appends a line to a marker file next to the database. If lines
# from an EARLIER boot are still there, the storage demonstrably survived a
# restart. That is proof rather than a guess.
_DISK_BOOTS = 0
_DISK_ERROR = None


def _record_boot():
    global _DISK_BOOTS, _DISK_ERROR
    path = os.path.join(os.path.dirname(os.path.abspath(DB)) or ".", ".boots")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        prior = []
        if os.path.exists(path):
            with open(path) as f:
                prior = [ln for ln in f.read().splitlines() if ln.strip()]
        # Keep the file small but keep the earliest line — it is the evidence.
        keep = (prior[:1] + prior[-40:]) if len(prior) > 41 else prior
        with open(path, "w") as f:
            f.write("\n".join(keep + ["%d %s" % (int(time.time()), BUILD_TAG)]) + "\n")
        _DISK_BOOTS = len(prior) + 1
    except Exception as e:
        _DISK_ERROR = str(e)
_SCHEMA_OK = False

# Free, persistent photo storage: Cloudflare R2 (S3-compatible, 10 GB free).
# Activated only when all of these are set; otherwise photos go to local disk
# (fine for dev, ephemeral on a free host). The bucket must have public read
# (an r2.dev URL or a custom domain) so the PWA can display the images.
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")   # e.g. https://pub-xxxx.r2.dev
_USE_R2 = bool(R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY and R2_BUCKET and R2_PUBLIC_URL)
_r2 = None
def _r2_client():
    global _r2
    if _r2 is None:
        import boto3  # lazy — only needed when R2 is configured
        # Verify against certifi's bundle when it is installed. Every upload in
        # production failed with an SSLError while Postgres TLS worked fine,
        # which is what a runtime with no CA bundle where botocore expects one
        # looks like. Falls back to the default when certifi is absent.
        verify = True
        try:
            import certifi
            verify = certifi.where()
        except Exception:
            pass
        _r2 = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY, aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto", verify=verify,
        )
    return _r2
# eChallan.app — traffic-violation lookup by registration number. Server-side only:
# their own docs say never to expose the key in browser-side widgets, and every
# device running this PWA would otherwise ship it. Set ECHALLAN_API_KEY in the host
# environment; without it the /challans endpoint reports "not configured" rather
# than failing obscurely.
ECHALLAN_API_KEY = os.environ.get("ECHALLAN_API_KEY", "")
ECHALLAN_BASE = os.environ.get("ECHALLAN_BASE", "https://api.echallan.app")

# Bumped by hand whenever a server change needs to be confirmed live. Vercel
# deploys on push, but an env-var change alone does NOT redeploy — it restarts the
# function with the OLD code. /health reporting a stale build (alongside `commit`)
# is the only way to tell that apart from a missing route, without dashboard access.
BUILD_TAG = "2026-08-22-vercel-10"

PORT = int(os.environ.get("PORT", "8766"))      # cloud hosts inject $PORT
_lock = threading.Lock()
SESSIONS = {}          # token -> {uid, exp}
SESSION_TTL = int(os.environ.get("SESSION_TTL_SEC", str(12 * 3600)))   # 12h
# CORS allow-list. Default = the production PWA (GitHub Pages) only; any
# localhost/127.0.0.1 port is also allowed for dev. Override with ALLOWED_ORIGIN
# env: a comma-separated list of exact origins, or "*" to allow any (not for prod).
PROD_ORIGIN = "https://bhuwangarg.github.io"
_env_origin = os.environ.get("ALLOWED_ORIGIN", "").strip()
if _env_origin == "*":
    ALLOWED_ORIGINS = "*"
elif _env_origin:
    ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _env_origin.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = [PROD_ORIGIN]
_LOCALHOST_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
# The packaged iOS/Android app serves its bundled shell from a fixed synthetic
# origin — capacitor://localhost on iOS, https://localhost on Android — and
# sends it on every sync request. Without these the native apps get a CORS
# failure on /auth/login and never sync at all. These are not addressable by a
# remote site: a page would have to be served from the device's own localhost
# to claim one, the same assumption the http://localhost dev rule already makes.
_NATIVE_APP_ORIGIN = re.compile(r"^(capacitor|ionic)://localhost$|^https://localhost$")

def cors_origin_for(origin):
    """Echo the request Origin when it's allowed (so other sites are blocked);
    otherwise fall back to the production origin (a browser from a disallowed
    site then sees a mismatch and blocks the response)."""
    if ALLOWED_ORIGINS == "*":
        return origin or "*"
    if origin:
        o = origin.rstrip("/")
        if o in ALLOWED_ORIGINS or _LOCALHOST_ORIGIN.match(o) or _NATIVE_APP_ORIGIN.match(o):
            return origin
    return ALLOWED_ORIGINS[0]
# Launch hardening knobs (safe defaults preserve dev behaviour):
#   ENABLE_DEMO_SEED=1  → seed the demo staff accounts (local testing only)
#   ENABLE_DEMO_SEED=0  → also DELETE demo accounts still on their published PINs
#   MAX_UPLOAD_MB       → reject oversized photo uploads (DoS guard)
#   ANTHROPIC_API_KEY   → enables the server-side /ai proxy (keeps the key off devices)
#
# The demo seed used to be ON unless the variable said "0". Its PINs are written
# in this file, the repo is public, and one of the accounts is an owner — so a
# deployment that simply never set the variable handed owner authority to anyone
# who read the source. Off unless asked for, and a published demo PIN is refused
# at login whenever the seed is not explicitly on (see _published_demo_pin).
_DEMO_SEED_ENV = os.environ.get("ENABLE_DEMO_SEED", "").strip()
ENABLE_DEMO_SEED = _DEMO_SEED_ENV == "1"
PURGE_DEMO_USERS = _DEMO_SEED_ENV == "0"
# GPS safety/misuse detection thresholds (configurable).
OVERSPEED_KPH = float(os.environ.get("OVERSPEED_KPH", "80"))
HARSH_DROP_KPH = float(os.environ.get("HARSH_DROP_KPH", "30"))   # speed drop in one push interval
IDLE_MIN = int(os.environ.get("IDLE_MIN", "15"))                  # engine-on, not moving, minutes
NIGHT_START_IST, NIGHT_END_IST = 23, 5                            # night-movement window (IST)

# Web push (VAPID). Public key is safe to ship to the browser; the private key
# stays server-side (local .vapid_private.pem, or the VAPID_PRIVATE_KEY env var).
VAPID_PUBLIC = os.environ.get("VAPID_PUBLIC", "BPbZL6mTam86eXAc8zT4vDCnP-0huKTqogZVEWjkUrhEkpIIS-V_kdFC9o78Ibu55ln7QSqUaoVT0Uq7lWX7-r8")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:mahalaxmitravels96@gmail.com")
try:
    from pywebpush import webpush, WebPushException   # installed via requirements.txt on the host
    _WEBPUSH = True
except Exception:
    _WEBPUSH = False

def _vapid_pem_path():
    # 1) local dev file, or 2) a host-mounted secret file named vapid_private.pem
    #    (at /etc/secrets/…), or 3) the VAPID_PRIVATE_KEY env var — which is how
    #    the Vercel deployment supplies it, since it mounts no secret files.
    for p in (".vapid_private.pem", "/etc/secrets/vapid_private.pem"):
        if os.path.exists(p):
            return p
    pem = os.environ.get("VAPID_PRIVATE_KEY", "")
    if pem:
        out = "/tmp/vapid_private.pem"
        with open(out, "w") as f:
            f.write(pem.replace("\\n", "\n"))
        return out
    return None
# Vercel caps a serverless request body at ~4.5 MB, and photos arrive as base64
# data URLs in the JSON body. Clamp the default there so an oversized photo gets a
# clear 413 from us instead of an opaque platform error the app cannot explain.
_ON_VERCEL = bool(os.environ.get("VERCEL"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "4" if _ON_VERCEL else "8")) * 1024 * 1024
# Any request body. Photos arrive as base64 inside JSON, so allow the upload cap
# plus that encoding's overhead, and never less than a large sync batch needs.
MAX_REQUEST_BYTES = max(MAX_UPLOAD_BYTES * 4 // 3 + 64 * 1024, 6 * 1024 * 1024)
# Records in one /push. The app sends at most 250 and a restore 200; one request
# holds the server's write lock for its whole batch.
MAX_PUSH_RECORDS = int(os.environ.get("MAX_PUSH_RECORDS", "1000"))
# A ceiling in bytes as well as in records. 1,000 records of inline photo data
# is a different request from 1,000 rows of text, and the platform's own limit
# answers with a bare 413 that says nothing. Refused before the body is read.
MAX_PUSH_BYTES = int(os.environ.get("MAX_PUSH_MB", "6")) * 1024 * 1024

# ---- Rate limiting on the sync endpoints ---------------------------------
#
# What this guards against is not an attacker. It is one phone stuck in a retry
# loop: on a per-request serverless bill that is a runaway cost with nobody
# watching, and the first anybody learns of it is the invoice.
#
# The ceilings sit well above what a working device does. A client tick is
# every four seconds, so a busy phone makes about fifteen pulls a minute and a
# push with them; 120 a minute is eight times that. Anything above it is a loop,
# not a person. Uploads are rarer and bigger, so they get their own hourly
# ceiling.
#
# Keyed on the USER, never the IP: the yard shares one wifi, and an IP limit
# would stop every conductor because one phone was stuck.
# ---- The wire protocol's version ----------------------------------------
#
# Phones update lazily: a conductor who does not reopen the app for three weeks
# is still calling whatever this server exposes today. So the endpoints may
# never change shape in place — a breaking change has to arrive as /v2 while
# /v1 keeps answering the old builds until they have all come back.
#
# /v1/<path> is accepted NOW, as an alias for the bare path, so that door
# exists before it is needed. Old clients keep calling /pull and /push and are
# unaffected; nothing has to be coordinated.
# ---- The schema's version ------------------------------------------------
#
# The schema is built by idempotent CREATE/ALTER at boot, which has been enough
# because every change so far has been an added table or an added column. The
# first change that is NOT additive — a column whose type moves, a table that
# splits — needs to know what it is starting from, and by then it is too late
# to start recording it. Bump this whenever the shape changes; the server
# writes it down and says so in the log when it moves.
SCHEMA_VERSION = 1

PROTOCOL_VERSION = 1
_VERSIONED = re.compile(r"^/v(\d+)(/.*)$")


def _strip_version(path):
    """('/pull', 1) for '/v1/pull'; ('/pull', None) for '/pull'.

    An unknown version is left alone so it 404s rather than being silently
    served the current shape — answering /v9 with v1 data is how a future
    client gets quietly wrong answers."""
    m = _VERSIONED.match(path)
    if not m:
        return path, None
    want = int(m.group(1))
    if want != PROTOCOL_VERSION:
        return path, want
    return m.group(2), want


# ---- Feature flags -------------------------------------------------------
#
# Every change has been live for every role the moment it deployed. For a fleet
# that runs at night that is the wrong default for anything risky: the only
# control was a rollback, which takes back the good with the bad.
#
# Flags are OFF unless named in FEATURE_FLAGS (comma-separated, set in Vercel —
# no redeploy to flip one). The server hands the list to the client on /pull,
# and the client's flagOn() defaults to false, so a flag that nobody set behaves
# exactly as the code did before flags existed.
def feature_flags():
    raw = os.environ.get("FEATURE_FLAGS", "")
    return sorted({f.strip() for f in raw.replace(";", ",").split(",") if f.strip()})


RL_SYNC_PER_MIN = int(os.environ.get("RL_SYNC_PER_MIN", "120"))
RL_UPLOAD_PER_HOUR = int(os.environ.get("RL_UPLOAD_PER_HOUR", "240"))
RATE_LIMIT_OFF = os.environ.get("RATE_LIMIT_OFF") == "1"   # escape hatch, no redeploy needed
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()

# Login brute-force protection: lock a user (and the source IP) after too many
# failed PIN attempts inside a rolling window.
MAX_FAILS = int(os.environ.get("MAX_LOGIN_FAILS", "5"))        # per user (strict)
# Per-IP backstop is generous: a whole garage of staff shares one public IP, so
# this must only catch a runaway script, not normal fat-fingering.
MAX_IP_FAILS = int(os.environ.get("MAX_IP_FAILS", "50"))
# 5 minutes, not 15. The app no longer shows a countdown, so it can only say
# "try again in a few minutes" — and that has to be true. 5 tries per 5 min is
# one attempt a minute sustained: working through all 10,000 four-digit PINs
# would take about a week of uninterrupted attack, so this still makes the PIN
# a credential while no longer stranding a storekeeper who fat-fingered it.
LOCK_WINDOW = int(os.environ.get("LOGIN_LOCK_SEC", "300"))     # 5 min
# How many reverse proxies sit in front of a standalone server (0 = none: use the
# socket address). Ignored on Vercel, which supplies the client address itself.
TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", "0"))

# Mirrors the client seed so the same demo PINs work against the server.
SEED_USERS = [
    ("u-owner", "Bhuwan (Owner)", "owner", "1111"),
    ("u-sup", "Vajid (Supervisor)", "supervisor", "2222"),
    ("u-store", "Suresh (Store)", "store", "3333"),
    ("u-m1", "Mukesh", "mechanic", "0001"),
    ("u-m2", "Imran", "mechanic", "0002"),
    ("u-m3", "Vijay", "mechanic", "0003"),
    ("u-d1", "Ramlal (Driver)", "driver", "0010"),
]


class _PgCursor:
    """The slice of sqlite3's cursor the server actually uses."""

    def __init__(self, cur):
        self._cur = cur

    def fetchone(self):
        try:
            return self._cur.fetchone()
        except Exception:
            return None          # a statement that returns no rows (INSERT/DELETE)

    def fetchall(self):
        try:
            return self._cur.fetchall()
        except Exception:
            return []


class _PgConn:
    """sqlite3-shaped facade over psycopg.

    Every query in this file was written against sqlite3: `conn.execute()` returns
    something fetchable and `?` marks a parameter. psycopg wants an explicit cursor
    and `%s`. Translating here keeps ONE set of SQL rather than two dialects that
    drift apart — the statements themselves are already portable now that the
    INSERT OR REPLACEs are ON CONFLICT.

    One connection is shared for the life of the process, guarded by a lock:
    /pull runs on a 4-second timer on every device, and opening a fresh Postgres
    connection per request would be both slow and a good way to exhaust Supabase's
    connection limit. close() therefore commits and keeps the socket.
    """

    _lock = threading.Lock()

    def __init__(self, dsn):
        import psycopg
        self._psycopg = psycopg
        self._dsn = dsn
        self._c = self._open()

    def _open(self):
        # prepare_threshold=None disables psycopg's automatic PREPARE. Supabase's
        # pooler on port 6543 runs PgBouncer in transaction mode, where a prepared
        # statement can be issued on one backend and executed on another — the
        # classic "prepared statement does not exist" failure. Harmless on a direct
        # connection, required through the pooler, which is what serverless needs.
        return self._psycopg.connect(self._dsn, autocommit=False, prepare_threshold=None)

    def _reconnect(self):
        try:
            self._c.close()
        except Exception:
            pass
        self._c = self._open()

    def execute(self, sql, params=()):
        q = sql.replace("?", "%s")
        with _PgConn._lock:
            try:
                cur = self._c.cursor()
                cur.execute(q, tuple(params))
            except Exception:
                # A dropped connection (Supabase idles them out) must not take the
                # process down — reconnect once and retry before giving up.
                self._reconnect()
                cur = self._c.cursor()
                cur.execute(q, tuple(params))
            return _PgCursor(cur)

    def commit(self):
        with _PgConn._lock:
            self._c.commit()

    def close(self):
        # Deliberately NOT closing: the connection is shared and reused.
        self.commit()


# --------------------------- static PWA hosting ----------------------------
# On Vercel the frontend is served BY this function rather than from the CDN.
# Vercel builds the Python function and, with no framework detected, produces no
# static output — index.html/app.js/sw.js simply are not in the deployment, so
# every asset fell through here and 404'd. Serving them from the function keeps
# the repo layout intact (predeploy-gate.sh, mobile/build-www.mjs and the Android
# workflow all read the root) and behaves the same on Vercel and locally.
APP_ROOT = os.path.dirname(os.path.abspath(__file__))
_CTYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
}
# Only these are ever served. An allow-list, so a stray file at the repo root can
# never be published by accident — sync.db and the VAPID key live here too.
_STATIC_OK = {".html", ".js", ".css", ".webmanifest", ".svg", ".png",
              ".jpg", ".jpeg", ".ico", ".woff2"}
# `.json` used to be on the list, and crew-removal backups (real Aadhaar and
# licence numbers) are .json files written into this same folder — a standalone
# server served them to anyone who guessed the timestamped name. The app loads no
# .json. Tooling and platform folders, and dot-files, are never served either.
_STATIC_DENY_DIRS = {"scripts", "mobile", "api", "uploads", "__pycache__", "node_modules", "redpro-extension"}


def _redact(msg):
    """Strip credentials out of a driver error before it reaches /health."""
    return re.sub(r"://[^@\s]*@", "://***@", str(msg))[:300]


def db_probe():
    """Actually run a query. dbMode said "postgres" whenever DATABASE_URL was set,
    which is not the same as the database being reachable — /health looked healthy
    while every write failed and login returned 500. Report what a round-trip does,
    not what the configuration implies."""
    try:
        c = db()
        c.execute("SELECT 1").fetchone()
        c.close()
        return True, None
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, _redact(e))


def _pg_host():
    """Host of DATABASE_URL for /health. Parsed rather than printed, so a password
    can never leak into a public endpoint."""
    if not _USE_PG:
        return None
    try:
        u = urlparse(DATABASE_URL)
        return "%s:%s" % (u.hostname or "?", u.port or 5432)
    except Exception:
        return "unparseable"


_PG_CONN = None
# A failing database must not be retried on every single request. /health probes
# the connection, the uptime cron pings /health, and every device polls /pull on a
# 4-second timer — with bad credentials that becomes a stream of failed logins,
# which is exactly what trips Supabase's pooler circuit breaker
# ("too many authentication failures, new connections are temporarily blocked").
# The breaker then hides whether the credentials were ever fixed. So remember a
# failure briefly and re-raise it without touching the network.
_PG_FAIL_AT = 0.0
_PG_FAIL_MSG = ""
PG_RETRY_AFTER = float(os.environ.get("PG_RETRY_AFTER_SEC", "20"))
_TURSO_OK = None   # None = not yet probed, True = auth works, False = failed → SQLite

def _connect():
    """A SQLite-compatible connection — Turso (remote, persistent) when configured
    AND reachable, otherwise the local SQLite file. libsql.connect() is lazy (it
    authenticates on the first query), so we probe once with SELECT 1: a bad token
    then fails HERE and we fall back cleanly instead of crashing mid-request."""
    global _TURSO_OK, _PG_CONN
    if _USE_PG:
        global _PG_FAIL_AT, _PG_FAIL_MSG
        if _PG_CONN is None:
            waited = time.time() - _PG_FAIL_AT
            if _PG_FAIL_MSG and waited < PG_RETRY_AFTER:
                raise DatabaseUnavailable(
                    "%s (cached %ds ago; not retrying for another %ds so a bad "
                    "credential cannot flood the pooler)"
                    % (_PG_FAIL_MSG, int(waited), int(PG_RETRY_AFTER - waited)))
            try:
                _PG_CONN = _PgConn(DATABASE_URL)
                _PG_FAIL_MSG = ""
            except Exception as e:
                _PG_FAIL_AT = time.time()
                _PG_FAIL_MSG = ("DATABASE_URL is set but Postgres is unreachable: %s" % e)
                raise DatabaseUnavailable(
                    "%s\nRefusing to fall back to a local SQLite file — writes made "
                    "against it would be stranded once Postgres returns." % _PG_FAIL_MSG)
        return _PG_CONN
    if _USE_TURSO and _TURSO_OK is not False:
        try:
            import libsql_experimental as libsql
            conn = libsql.connect(database=TURSO_URL, auth_token=TURSO_TOKEN)
            if _TURSO_OK is None:
                conn.execute("SELECT 1")          # force auth now (one-time probe)
                _TURSO_OK = True
                print("Turso connected OK (persistent).")
            return conn
        except Exception as e:
            _TURSO_OK = False
            if not _ALLOW_FALLBACK:
                raise DatabaseUnavailable(
                    "Turso is configured (TURSO_URL + TURSO_AUTH_TOKEN) but unreachable: %s\n"
                    "Refusing to serve from an empty local SQLite file — writes made against it "
                    "would be stranded when Turso comes back.\n"
                    "Fix the credentials, or unset TURSO_URL/TURSO_AUTH_TOKEN to run on the "
                    "mounted disk at %s, or set ALLOW_SQLITE_FALLBACK=1 to override." % (e, DB))
            print("WARNING: Turso unavailable — falling back to local SQLite "
                  "(ALLOW_SQLITE_FALLBACK=1 was set):", e)
    return sqlite3.connect(DB)


def db():
    global _SCHEMA_OK
    c = _connect()
    if not _SCHEMA_OK:                      # create the schema once per process
        c.execute("""CREATE TABLE IF NOT EXISTS records(
            store TEXT, id TEXT, data TEXT, updatedAt BIGINT, rev BIGINT,
            PRIMARY KEY(store, id))""")
        c.execute("""CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY, name TEXT, role TEXT, salt TEXT, pin_hash TEXT)""")
        # When this account last authenticated. Without it two accounts with the
        # same name are indistinguishable, and deciding which of them to delete
        # means guessing — which is how you lock somebody out of their own app.
        # ALTER on an existing table, so a deployed database picks it up.
        try:
            c.execute("ALTER TABLE users ADD COLUMN last_login BIGINT")
        except Exception:
            pass
        c.execute("""CREATE TABLE IF NOT EXISTS pushsubs(
            endpoint TEXT PRIMARY KEY, sub TEXT, role TEXT, at BIGINT)""")
        # Private server-side key/value — NOT exposed via /pull (which only reads `records`).
        c.execute("""CREATE TABLE IF NOT EXISTS sys(k TEXT PRIMARY KEY, v TEXT)""")
        # Latest live GPS position per bus — persisted so the map survives restarts.
        c.execute("""CREATE TABLE IF NOT EXISTS gpslive(reg TEXT PRIMARY KEY, data TEXT, at BIGINT)""")
        # Failed logins. In a single long-running process an in-memory dict was
        # enough; across serverless containers each one would keep its own tally
        # and the 5-try lockout would effectively vanish — which matters a lot when
        # PINs are 4 digits and every crew account ships with 0000.
        c.execute("""CREATE TABLE IF NOT EXISTS loginfails(k TEXT, at BIGINT)""")
        c.execute("""CREATE INDEX IF NOT EXISTS loginfails_k ON loginfails(k)""")
        # One id per login attempt, so a successful attempt can remove exactly the
        # row it added (many attempts land in the same second).
        # Commit first: on Postgres a failing ALTER (column already there) makes
        # the connection reconnect, which would drop anything not yet committed.
        try:
            c.commit()
        except Exception:
            pass
        try:
            c.execute("ALTER TABLE loginfails ADD COLUMN nonce TEXT")
        except Exception:
            pass
        # Logins switched off because the crew record says the person left or was
        # archived. Kept apart from `users` so a rehire only has to remove the row.
        c.execute("""CREATE TABLE IF NOT EXISTS disabledlogins(id TEXT PRIMARY KEY, at BIGINT)""")
        # AI proxy calls per user per day — the key is billed to the operator.
        c.execute("""CREATE TABLE IF NOT EXISTS aiusage(k TEXT PRIMARY KEY, n BIGINT)""")
        # One row per (bucket, user, time window). Old windows are swept rather
        # than kept — see _rate_ok.
        c.execute("""CREATE TABLE IF NOT EXISTS ratelimit(
            k TEXT PRIMARY KEY, n BIGINT, win BIGINT)""")
        # Record which schema this deploy expects, and say so when it changes.
        # Written after the CREATEs above, so it only lands if they succeeded.
        try:
            row = c.execute("SELECT v FROM sys WHERE k='schema_version'").fetchone()
            was = int(row[0]) if row and str(row[0]).isdigit() else 0
            if was != SCHEMA_VERSION:
                c.execute("INSERT INTO sys(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
                          ("schema_version", str(SCHEMA_VERSION)))
                print("schema version %d -> %d" % (was, SCHEMA_VERSION))
        except Exception as e:                       # never let bookkeeping stop a boot
            print("schema version note failed: %s" % type(e).__name__)
        try:
            c.commit()
        except Exception:
            pass
        _SCHEMA_OK = True
    return c


_SECRET = None
def _session_secret():
    """Stable HMAC secret for signing session tokens. Persisted (Turso/SQLite) so
    tokens survive server restarts — fixes the cold-start 401 storm on Render free."""
    global _SECRET
    if _SECRET:
        return _SECRET
    with _lock:
        c = db()
        row = c.execute("SELECT v FROM sys WHERE k='session_secret'").fetchone()
        if row and row[0]:
            _SECRET = row[0]
        else:
            _SECRET = _secrets.token_hex(32)
            c.execute("INSERT INTO sys(k,v) VALUES('session_secret',?) "
                      "ON CONFLICT(k) DO UPDATE SET v=excluded.v", (_SECRET,))
            c.commit()
        c.close()
    return _SECRET


_R2_PROBE = {"at": 0.0, "ok": None, "err": None, "detail": None}


def r2_config_hint():
    """Config mistakes that cannot be told apart from a network failure.

    A Cloudflare account id is 32 hex characters and forms the endpoint
    hostname. One character short — a copy-paste that dropped a digit — points
    at a host that does not exist, and the TLS handshake is refused: every
    upload fails with an SSLError that reads like a runtime problem, and did,
    for months, while /health happily reported the variable as SET."""
    acct = (R2_ACCOUNT_ID or "").strip()
    if not acct:
        return "R2_ACCOUNT_ID is not set"
    if not re.fullmatch(r"[0-9a-fA-F]{32}", acct):
        return ("R2_ACCOUNT_ID is %d characters; a Cloudflare account id is 32 hex characters"
                % len(acct))
    if not (R2_BUCKET or "").strip():
        return "R2_BUCKET is not set"
    if R2_PUBLIC_URL and not R2_PUBLIC_URL.startswith("http"):
        return "R2_PUBLIC_URL should start with https://"
    return None


def r2_probe(ttl=300):
    """Does the configured bucket actually answer? Cached, and metadata only.

    `r2Vars` on /health only ever said the env vars were SET. Every photo in the
    system was stored inline as a data URL, which means no upload ever returned
    a link — and nothing anywhere said why, because the failure is a print()
    into logs this plan cannot read. One HeadBucket per five minutes answers it
    from the outside. The error is reported as its class and S3 code (such as
    AccessDenied or NoSuchBucket), never a credential."""
    if not _USE_R2:
        return {"configured": False}
    hint = r2_config_hint()
    if hint:
        # No point in a network round trip when the settings cannot work.
        return {"configured": True, "ok": False, "error": "config", "hint": hint}
    now = time.time()
    if _R2_PROBE["at"] and now - _R2_PROBE["at"] < ttl:
        return {"configured": True, "ok": _R2_PROBE["ok"], "error": _R2_PROBE["err"],
                "detail": _R2_PROBE.get("detail")}
    ok, err, detail = False, None, None
    try:
        _r2_client().head_bucket(Bucket=R2_BUCKET)
        ok = True
    except Exception as e:
        err = type(e).__name__
        try:
            code = (getattr(e, "response", None) or {}).get("Error", {}).get("Code")
            if code:
                err += ":" + str(code)[:40]
        except Exception:
            pass
        # The class alone said "SSLError" and no more. The message names the
        # actual cause (a missing CA bundle reads very differently from a wrong
        # endpoint); _redact strips anything credential-shaped.
        detail = _redact(e)[:200]
    _R2_PROBE.update(at=now, ok=ok, err=err, detail=detail)
    return {"configured": True, "ok": ok, "error": err, "detail": detail}


def hash_pin(salt, pin):
    return hashlib.sha256((salt + str(pin)).encode()).hexdigest()


def now_ms():
    return int(time.time() * 1000)


def _upsert_record(c, store, rid, data, updated, base_rev):
    """Insert/update a record with a fresh rev. Returns the new rev.

    The payload carries the timestamp too, because that is the one devices
    compare: pullPage() applies a record only when `data.updatedAt` beats the
    copy it already holds. Server-side writes built their payload by hand and
    mostly forgot it — so a rename, a lastLoginAt or a tombstone bumped the
    envelope, the device judged the record "not newer", and the change was
    invisible on every phone that already had the record. One rename went
    through to the server and stayed hidden on the floor for a day. Stamped
    here rather than at each call site, so the next one cannot forget."""
    rev = base_rev + 1
    if isinstance(data, dict) and (data.get("updatedAt") or 0) < updated:
        data["updatedAt"] = updated
    c.execute("""INSERT INTO records(store,id,data,updatedAt,rev) VALUES(?,?,?,?,?)
                 ON CONFLICT(store,id) DO UPDATE SET
                   data=excluded.data, updatedAt=excluded.updatedAt, rev=excluded.rev""",
              (store, rid, json.dumps(data), updated, rev))
    return rev


def seed_users():
    with _lock:
        c = db()
        for uid, name, role, pin in SEED_USERS:
            # A seeded account the owner deleted stays deleted. Without this the
            # next cold start put it straight back, with its published PIN.
            if _user_tombstoned(c, uid):
                continue
            if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                salt = uuid.uuid4().hex
                c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                          (uid, name, role, salt, hash_pin(salt, pin)))
                # publish a PIN-FREE user record so devices see the roster but never
                # the credential (PINs live only as salted hashes, server-side).
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "users", uid,
                               {"id": uid, "name": name, "role": role}, now_ms(), rev)
        c.commit()
        c.close()


_BOOTSTRAPPED = False
_BOOT_ERROR = None
_BOOT_LOCK = threading.Lock()


def bootstrap():
    """Everything that used to live under `if __name__ == "__main__"`.

    Vercel imports Handler and never runs the __main__ block, so on serverless
    none of this happened: no seeded owner account (nobody could log in, so the
    restore could not even authenticate), and ENABLE_DEMO_SEED=0 silently stopped
    purging the demo accounts whose PINs are published in this repo.

    Idempotent and cheap after the first call, so the request path can call it on
    every request and pay only a boolean check once a container is warm.
    """
    global _BOOTSTRAPPED, _BOOT_ERROR
    if _BOOTSTRAPPED:
        return
    with _BOOT_LOCK:
        if _BOOTSTRAPPED:
            return
        try:
            _load_live_gps()
            rebuild_disabled_logins()
            if ENABLE_DEMO_SEED:
                seed_users()
            elif PURGE_DEMO_USERS:
                purge_demo_users()
            _BOOTSTRAPPED = True
            _BOOT_ERROR = None
        except Exception as e:
            # Recorded rather than swallowed. This failing means no accounts exist,
            # so every login returns "invalid PIN" with nothing to explain why.
            _BOOT_ERROR = "%s: %s" % (type(e).__name__, _redact(e))
            raise


def purge_demo_users():
    """Remove demo accounts that ENABLE_DEMO_SEED created on an earlier boot.

    Turning the flag off only stops seeding — it does not delete what a previous
    run already inserted. Since the demo PINs are published in a public repo,
    leaving them behind on a real deployment is a live owner-level hole.

    An account is only removed if its stored hash still matches the demo PIN,
    i.e. nobody ever changed it. That is what makes this safe to run on every
    boot: the moment the owner sets a real PIN, their account stops matching and
    is kept.
    """
    with _lock:
        c = db()
        removed = []
        for uid, _name, _role, pin in SEED_USERS:
            row = c.execute("SELECT salt,pin_hash FROM users WHERE id=?", (uid,)).fetchone()
            if not row:
                continue
            if hash_pin(row[0], pin) == row[1]:
                c.execute("DELETE FROM users WHERE id=?", (uid,))
                # A tombstone, not a hard delete: /pull can only tell a device
                # about a record it can still see. Deleting the row outright
                # left the demo tile on every phone that had already synced —
                # visible on the login screen, with a PIN that may still be
                # cached on it.
                rev0 = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "users", uid, {"id": uid, "_deleted": True}, now_ms(), rev0)
                removed.append(uid)
        c.commit()
        c.close()
    if removed:
        print("Removed demo accounts still using their published PINs: " + ", ".join(removed))
    return removed


# ----------------------------- auth helpers --------------------------------
def client_ip(handler):
    """The caller's address, from a source the caller cannot choose.

    The first X-Forwarded-For value is whatever the client wrote, so keying the
    per-IP backstop on it let a script present a fresh IP with every guess, or
    pin the garage's shared IP to lock every staff member out. On Vercel the
    platform sets x-real-ip itself. Elsewhere a proxy is trusted only when
    TRUSTED_PROXY_HOPS says how many sit in front, and then the address is read
    from the right-hand end, which the proxies wrote."""
    if _ON_VERCEL:
        ip = (handler.headers.get("x-real-ip") or "").strip()
        if ip:
            return ip
    hops = TRUSTED_PROXY_HOPS
    if hops > 0:
        parts = [p.strip() for p in (handler.headers.get("X-Forwarded-For") or "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return handler.client_address[0]


def reserve_attempt(uid, ip, nonce=None):
    """Count this login attempt BEFORE the PIN is checked, and refuse it if the
    account or address is already at its limit. Returns seconds to wait, or 0.

    Checking the count and recording a failure as two separate steps let a burst
    of simultaneous requests all pass the check before any failure was written,
    so far more than MAX_FAILS guesses were tried per window. The check and the
    insert are now one step, and a correct PIN removes its own reservation."""
    now = int(time.time())
    cutoff = now - LOCK_WINDOW
    ukey, ikey = "u:" + uid, "ip:" + ip
    with _lock:
        c = db()
        c.execute("DELETE FROM loginfails WHERE at < ?", (cutoff,))
        for key, limit in ((ukey, MAX_FAILS), (ikey, MAX_IP_FAILS)):
            rows = c.execute("SELECT at FROM loginfails WHERE k=? AND at>=? ORDER BY at ASC",
                             (key, cutoff)).fetchall()
            if len(rows) >= limit:
                c.commit()
                c.close()
                return max(int(LOCK_WINDOW - (now - rows[0][0])) + 1, 1)
        for key in (ukey, ikey):
            c.execute("INSERT INTO loginfails(k,at,nonce) VALUES(?,?,?)", (key, now, nonce))
        c.commit()
        c.close()
    return 0


def release_attempt(uid, ip, nonce=None):
    """A correct PIN: drop this account's failure history and the one reservation
    this attempt added to the address. The rest of the address's count stays —
    one good login used to wipe it, so a valid account reset the backstop for
    every guess made against other accounts."""
    with _lock:
        c = db()
        c.execute("DELETE FROM loginfails WHERE k=?", ("u:" + uid,))
        if nonce:
            c.execute("DELETE FROM loginfails WHERE k=? AND nonce=?", ("ip:" + ip, nonce))
        c.commit()
        c.close()


def _user_tombstoned(c, user_id):
    """Was this account deliberately deleted? /auth/users/delete leaves a
    tombstone on the synced roster row; that is the record of the decision."""
    row = c.execute("SELECT data FROM records WHERE store='users' AND id=?", (user_id,)).fetchone()
    if not row:
        return False
    try:
        return bool(json.loads(row[0]).get("_deleted"))
    except Exception:
        return False


# Every crew login used to be created with this one PIN, and the ids it protects
# are listed by the public /roster. It now only exists on accounts made before
# per-person PINs; register_roster replaces it, and login refuses it.
CREW_DEFAULT_PIN = "0000"
CREW_ROLES = ("driver", "conductor")
_SEED_PIN = {uid: pin for uid, _n, _r, pin in SEED_USERS}


# `office` is a read-only login: how the drivers and conductors are performing
# and what passengers said about them, and nothing else. It is deliberately
# absent from PII_ROLES below, so the crew records it receives arrive with the
# phone number, address, licence, documents and salary stripped out — an office
# clerk comparing ratings has no business holding a driver's Aadhaar.
ALL_ROLES = ("owner", "supervisor", "crewmanager", "office", "store", "mechanic", "driver", "conductor")
# The accounts a supervisor may create or reset. Mirrors the app's rule that only
# the owner creates supervisors, crew managers and owners (saveStaff in app.js).
SUPERVISOR_MANAGES = ("store", "mechanic", "driver", "conductor")


def may_manage(actor_role, target_role):
    """Can someone with actor_role create, or reset the PIN of, target_role?"""
    if actor_role == "owner":
        return target_role in ALL_ROLES
    if actor_role == "supervisor":
        return target_role in SUPERVISOR_MANAGES
    return False


def user_role(user_id):
    c = db()
    row = c.execute("SELECT role FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    return row[0] if row else None


def random_pin():
    """A 4-digit PIN that is not the old shared crew default."""
    while True:
        p = "%04d" % _secrets.randbelow(10000)
        if p != CREW_DEFAULT_PIN:
            return p


def pin_refusal(user_id, role, pin):
    """A PIN anyone can read off the public source is not a credential.

    Returns why this PIN may not be used for this account (at login, or as a new
    PIN), or None. The published demo PINs stay usable only while the demo seed
    is explicitly switched on for local testing."""
    pin = str(pin or "")
    if not ENABLE_DEMO_SEED and _SEED_PIN.get(user_id) == pin:
        return "demo_pin"
    if role in CREW_ROLES and pin == CREW_DEFAULT_PIN:
        return "default_pin"
    return None


def login_refusal(user_id, pin):
    """pin_refusal() for an existing account, looked up by id. None if unknown."""
    c = db()
    row = c.execute("SELECT role FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    return pin_refusal(user_id, row[0], pin) if row else None


def do_login(user_id, pin):
    c = db()
    row = c.execute("SELECT id,name,role,salt,pin_hash FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    if not row or hash_pin(row[3], pin) != row[4]:
        return None
    # Stamp the login, and push it through the synced roster rather than widening
    # the public /roster: when an account was last used is operational data for
    # whoever manages staff, and `users` is only readable with a token.
    now = now_ms()
    try:
        with _lock:
            c2 = db()
            c2.execute("UPDATE users SET last_login=? WHERE id=?", (now, row[0]))
            rev = c2.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c2, "users", row[0],
                           {"id": row[0], "name": row[1], "role": row[2], "lastLoginAt": now}, now, rev)
            c2.commit()
            c2.close()
    except Exception:
        pass          # a login must never fail because bookkeeping did
    return {"token": _make_token(row[0], row[3]), "user": {"id": row[0], "name": row[1], "role": row[2]}}


def user_exists(user_id):
    """Does the server hold a login for this id?

    A rejected login has two very different causes, and the client has to tell
    them apart: the PIN is wrong, or the account lives only on the device (the
    bulk-seeded crew were never registered here). Answering both with a bare 401
    forced the client to fall back to its cached PIN in BOTH cases, which kept a
    rotated PIN working on any phone that had used the old one.
    """
    c = db()
    row = c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone()
    c.close()
    return bool(row)


# Tokens issued before sessions were bound to the PIN carry the old signature.
# They are honoured only if they expire before this moment (2026-09-17 18:00 UTC),
# so the change logs nobody out, and after it no unbound token works at all.
LEGACY_TOKEN_CUTOFF = 1789668000


def _token_sig(uid, exp, salt):
    """The signature covers the account's current PIN salt. set_pin gives the
    account a new salt, so a PIN change or reset ends every session issued under
    the old PIN — before, a token taken from a phone kept working for its whole
    lifetime after the PIN it came from was changed."""
    msg = f"{uid}.{exp}.{salt}" if salt is not None else f"{uid}.{exp}"
    return hmac.new(_session_secret().encode(), msg.encode(), hashlib.sha256).hexdigest()


def _make_token(uid, salt):
    exp = int(time.time() + SESSION_TTL)
    return f"{uid}.{exp}.{_token_sig(uid, exp, salt)}"


def user_for_token(token):
    # Stateless: verify the HMAC signature + expiry — no in-memory session store,
    # so tokens stay valid across server restarts (no cold-start 401 storm).
    parts = (token or "").split(".")
    if len(parts) != 3:
        return None
    uid, exp, sig = parts
    try:
        if int(exp) < time.time():
            return None
    except ValueError:
        return None
    c = db()
    row = c.execute("SELECT id,name,role,salt FROM users WHERE id=? AND id NOT IN "
                    "(SELECT id FROM disabledlogins)", (uid,)).fetchone()
    c.close()
    if not row:
        return None
    if not hmac.compare_digest(sig, _token_sig(uid, exp, row[3])):
        if int(exp) > LEGACY_TOKEN_CUTOFF or not hmac.compare_digest(sig, _token_sig(uid, exp, None)):
            return None
    return {"id": row[0], "name": row[1], "role": row[2]}


def create_user(name, role, pin):
    uid = "u-" + uuid.uuid4().hex[:6]
    salt = uuid.uuid4().hex
    with _lock:
        c = db()
        c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                  (uid, name, role, salt, hash_pin(salt, pin)))
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "users", uid, {"id": uid, "name": name, "role": role}, now_ms(), rev)
        c.commit()
        c.close()
    return {"id": uid, "name": name, "role": role}


def rename_user(user_id, name):
    """Correct the name on an account itself, not just on the synced record.

    Two places carry a person's name: the `users` table, which is what the
    server hands out at /roster and stamps nowhere else, and the synced `users`
    record, which is what every device actually displays. Renaming only the
    record leaves a device that has never synced showing the old name from the
    roster fallback, so both move together or neither does."""
    with _lock:
        c = db()
        row = c.execute("SELECT id,name,role FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            c.close()
            return None
        c.execute("UPDATE users SET name=? WHERE id=?", (name, user_id))
        # Merge into whatever the record already holds rather than replacing it:
        # a user record can carry more than the three roster columns, and a
        # rename has no business dropping the rest of it.
        old = c.execute("SELECT data FROM records WHERE store='users' AND id=?", (user_id,)).fetchone()
        data = {}
        if old:
            try:
                data = json.loads(old[0]) or {}
            except Exception:
                data = {}
        data.update({"id": user_id, "name": name, "role": row[2]})
        data.pop("_deleted", None)
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "users", user_id, data, now_ms(), rev)
        c.commit()
        c.close()
    return {"id": row[0], "was": row[1], "name": name, "role": row[2]}


def set_pin(user_id, pin):
    """Rotate a user's PIN (new salt + hash). Returns False if no such user."""
    with _lock:
        c = db()
        row = c.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            c.close()
            return False
        salt = uuid.uuid4().hex
        c.execute("UPDATE users SET salt=?, pin_hash=? WHERE id=?", (salt, hash_pin(salt, pin), user_id))
        c.commit()
        c.close()
    return True


# ----------------------------- sync helpers --------------------------------
# Server-side write enforcement (mirrors the client PERMS matrix in app.js so no
# legitimate flow is denied). Allow-list: a role may push to a store only if listed.
# owner passes everything. An unknown store, or a role not listed, → denied (the
# record is rejected, the client quarantines it — it never wedges the outbox).
# This is the teeth behind the anti-pilferage gate: a driver/conductor/mechanic
# token can no longer forge a ledger/vendor/fleet row via a crafted request.
WRITE_ROLES = {
    "ledger":        {"owner", "supervisor", "store"},
    "purchases":     {"owner", "supervisor", "store"},
    "vendors":       {"owner", "supervisor", "store"},
    # The crew manager also books diesel, AdBlue and tyres: the person who runs
    # the duty board is the one at the pump and at the tyre shop. They stay out
    # of the stock ledger, bills and job cards — and `fuel`/`def` are
    # append-only for everyone but a manager (below), so an entry that shows a
    # mileage drop cannot be edited away by whoever made it.
    "components":    {"owner", "supervisor", "store", "crewmanager"},
    "def":           {"owner", "supervisor", "store", "crewmanager"},
    "fuel":          {"owner", "supervisor", "store", "crewmanager"},
    "parts":         {"owner", "supervisor", "store"},
    "audits":        {"owner", "supervisor", "store"},
    "buses":         {"owner", "supervisor"},
    # The garage's own settings — labour rate, late cutoff and penalty, the
    # geofence. They decide what a job costs, so they are the owner's and the
    # supervisor's, and they are the same on every phone or the money is not.
    "meta":          {"owner", "supervisor"},
    "routes":        {"owner", "supervisor"},
    # crewmanager is a single-job login: the duty board and the crew bank. It
    # writes `drivers` (bus assignment, details, documents) and nothing else.
    "drivers":       {"owner", "supervisor", "crewmanager"},
    "incidents":     {"owner", "supervisor"},
    # A breakdown is written at the roadside by whoever is dealing with it, which
    # in practice is the supervisor or the owner. The driver reports the symptom
    # through driverreports; this is the record of the failure itself.
    "breakdowns":    {"owner", "supervisor"},
    # The gate pass is the garage's word that a unit left the premises, and the
    # serial on it is what the returning unit is checked against. Whoever can
    # write one can authorise a component out of the gate, so it sits with the
    # people who already sign work out: owner and supervisor.
    "gatepasses":    {"owner", "supervisor"},
    "users":         {"owner", "supervisor"},
    "jobcards":      {"owner", "supervisor", "store", "mechanic"},
    # Who sat on which bus, from when — written by whoever runs the duty board.
    # Append-only; see _guard_write.
    "dutylog":       {"owner", "supervisor", "crewmanager"},
    # The departure checklist. The driver fills it and releases; owner and
    # supervisor only decide go/hold on a failed one. See _guard_write.
    "gatechecks":    {"owner", "supervisor", "driver"},
    # "This name redBus shows on this bus is this crew member", confirmed once by the office.
    "rbalias":       {"owner", "supervisor", "crewmanager"},
    # The conversation log: "we spoke to this man about this, on this day".
    # The office writes these — it is the whole reason that login can write at
    # all — alongside the managers who also have the conversations.
    "crewnotes":     {"owner", "supervisor", "crewmanager", "office"},
    "trips":         {"owner", "supervisor", "driver"},
    "triplog":       {"owner", "supervisor", "driver"},
    # Operational stores every role legitimately writes:
    # The office login writes two things and only two: its own attendance,
    # and the usage counters every login writes. No crew record, no rating,
    # no bus — it is a window, not a desk.
    "attendance":    {"owner", "supervisor", "crewmanager", "office", "store", "mechanic", "driver", "conductor"},
    # Every role records its own daily usage counters; the report is read-only
    # aggregation over them, and nothing here carries business data.
    "usage":         {"owner", "supervisor", "crewmanager", "office", "store", "mechanic", "driver", "conductor"},
    "driverreports": {"owner", "supervisor", "store", "mechanic", "driver", "conductor"},
    # Server-ingest only — no client ever pushes these (AirFi → ingest_gps):
    "gpsevents":     set(),
    "gpslive":       set(),
    # Written by the /challans proxy from the upstream response. A client must
    # never be able to push these: forged "no pending challans" rows would hide a
    # real liability, and the data is billable to fetch.
    "challans":      set(),
}

# Stores the server alone writes, from an upstream it controls. Enforced ahead of
# every role check, owner included — see may_write().
# `stockmoves` is server-written too: it is the tamper-evident record of every
# change to a part's quantity, so the people it watches must not be able to add
# to it or delete from it.
SERVER_INGEST_ONLY = {"gpsevents", "gpslive", "challans", "odometerlogs", "waconv",
                      # ITS PNR lookups, written only by /its/lookup.
                      "itslookup",
                      "stockmoves",
                      # redPro data, written only by /redpro/ingest from the office collector.
                      "rbservices", "rbreviews", "rbcomplaints", "rbassign",
                      # Claude's reading of each review (whose fault), written only by /ai/reviews;
                      # aimeta is that job's own bookkeeping and is never sent to any phone.
                      "rbreviewai", "aimeta",
                      # Claude's answer for each typed redBus name (name_ai.py), written only by /ai/names.
                      "rbaliasai",
                      # Claude's look at each gate check's photos (gate_ai.py), written only by /ai/gate.
                      "gateai",
                      # Claude's look at each returned old part's photo (core_ai.py), written only by /ai/core.
                      "coreai",
                      # Claude's draft job card for each driver report (report_ai.py), written only by /ai/reports.
                      "reportai",
                      # The weekly coaching notes (coach_ai.py): drafted by /ai/coaching, approved through
                      # /ai/coaching/decide, read by the crew member through /my/coaching.
                      "coachai",
                      # The Monday summary (digest_ai.py), written only by /ai/digest.
                      "digest"}

# A phone with a wrong clock is normal; a record dated 2100 is not. Without a
# bound, last-write-wins makes a far-future write permanent — the owner's
# correction is silently discarded because its timestamp is "older".
MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
# A check-in reaching the server later than this after its stated time is marked
# `atUnverified`: offline, or a phone clock set back to dodge a late mark.
ATTENDANCE_TRUST_MS = 10 * 60 * 1000

# Proof that the work happened. Mirrors photoGateReady() in app.js — but that one
# runs in the browser, which a thief simply does not use.
def _has_proof(d):
    before = d.get("beforePhotos") or []
    after = d.get("afterPhotos") or []
    if d.get("externalVendor"):
        return bool(before or after)      # a vendor's bill photo stands in
    return bool(before and after)


def _job_crew(rec):
    """User ids on a job card: `assignees` if present, else the one `assignedTo`.

    Mirrors jobCrew() in app.js. Cards written before multi-mechanic jobs have
    only `assignedTo`, and must still have a crew of one."""
    rec = rec or {}
    ids = []
    for a in rec.get("assignees") or []:
        uid = a.get("userId") if isinstance(a, dict) else None
        if uid and str(uid) not in ids:
            ids.append(str(uid))
    if not ids and rec.get("assignedTo"):
        ids.append(str(rec["assignedTo"]))
    return ids


# Roles that run the garage. Per-record authorship rules below bind everyone else.
MANAGER_ROLES = ("owner", "supervisor")
# Records that are evidence against the people who write them: counts that show a
# shortfall, fuel that shows a mileage drop. Once written, only a manager changes
# or removes them — the ledger's append-only rule, extended to its siblings.
APPEND_ONLY_FOR_STAFF = ("audits", "fuel", "def")
# What a non-manager may change on a supplier bill after it is entered: marking it
# paid (togglePaid in app.js). The amount and lines are fixed.
PURCHASE_STAFF_FIELDS = ("paymentStatus", "paidAt", "paidBy")
# Server stamps and bookkeeping that differ on every write and are not content.
_META = ("updatedAt", "_by", "_byRole", "_org", "_createdBy", "_createdRole")


def _same_except(a, b, allowed):
    """Are records a and b equal apart from the `allowed` fields and metadata?"""
    keys = (set(a) | set(b)) - set(allowed) - set(_META)
    return all(a.get(k) == b.get(k) for k in keys)


def _crew_record_for(c, user_id):
    """The live crew-bank record (drivers store) whose login is this user."""
    if c is None:
        return None
    for raw, in c.execute("SELECT data FROM records WHERE store='drivers'").fetchall():
        try:
            d = json.loads(raw)
        except Exception:
            continue
        if isinstance(d, dict) and d.get("userId") == user_id and not d.get("_deleted"):
            return d
    return None


# A crew member's own redBus reviews. Their phone is never sent the reviews or what links one to
# a trip (redact_for), so the server traces them (crew_trace.py, the same rules as trace.js) and
# returns only the reviews of trips this login's crew record was on: no PNR, seat or time.
CREW_REVIEW_DAYS = 90
_CREW_RV_STORES = ("rbreviews", "rbservices", "gatechecks", "rbassign", "buses", "dutylog", "itslookup", "rbalias", "rbreviewai")
_CREW_RV_MEMO = {"key": None, "ix": None}


def _crew_review_index(c):
    """crewId -> their traced reviews (crew_trace.index_by_crew), and the trace context; rebuilt only
    when one of the stores changed or the day turned. Call with `_lock` held."""
    import crew_trace
    inlist = ",".join("'%s'" % st for st in _CREW_RV_STORES)
    # Re-traced only when one of the stores changed (or the day turned, for the window).
    key = (tuple(c.execute("SELECT COUNT(*), COALESCE(MAX(rev),0) FROM records WHERE store IN (%s)" % inlist).fetchone()),
           int(now_ms() // 86400000))
    if _CREW_RV_MEMO["key"] != key:
        rows = {st: [] for st in _CREW_RV_STORES}
        for st, raw in c.execute("SELECT store, data FROM records WHERE store IN (%s)" % inlist).fetchall():
            try:
                d = json.loads(raw)
            except Exception:
                continue
            if isinstance(d, dict) and not d.get("_deleted"):
                rows[st].append(d)
        ctx = crew_trace.Context(rows["rbservices"], rows["gatechecks"], rows["rbassign"], rows["buses"],
                                 rows["dutylog"], rows["itslookup"], rows["rbalias"])
        _CREW_RV_MEMO.update(key=key, ctx=ctx, ix=crew_trace.index_by_crew(
            rows["rbreviews"], ctx, now_ms() - CREW_REVIEW_DAYS * 86400000,
            {a.get("id"): a for a in rows["rbreviewai"]}))
    return _CREW_RV_MEMO["ix"] or {}, _CREW_RV_MEMO.get("ctx")


def crew_reviews_for(user_id):
    with _lock:
        c = db()
        try:
            me = _crew_record_for(c, user_id)
            if not me:
                return {"crewId": None, "reviews": [], "days": CREW_REVIEW_DAYS}
            _crew_review_index(c)
        finally:
            c.close()
    return {"crewId": me.get("id"), "reviews": (_CREW_RV_MEMO["ix"] or {}).get(me.get("id"), [])[:300],
            "days": CREW_REVIEW_DAYS}


def _guard_write(store, rid, data, actor, existing, c=None):
    """Enforce, server-side, the rules the app promises.

    Everything here was previously enforced only in app.js. Staff are given a
    login, not a copy of app.js, so any of it could be walked straight past with
    one authenticated HTTP request. Returns a reason to reject, or None to allow;
    may rewrite `data` in place to stamp server truth over anything the body
    claimed.
    """
    if not actor or not isinstance(data, dict):
        return None
    old = existing or {}

    manager = actor["role"] in MANAGER_ROLES

    if store == "gatechecks":
        return _guard_gatecheck(data, actor, old, manager, c)

    if store == "rbalias":
        return _guard_rbalias(data, actor, old, c)

    if store == "dutylog":
        # The record a review, a complaint or a challan is traced to a crew by.
        # If it could be edited, "who drove that night" would be whatever the
        # last person to touch it wanted — so nobody edits it, owner included.
        if old:
            if data.get("_deleted"):
                return "the duty log cannot be deleted"
            # Two phones can each write the same starting row for a crew member
            # (its id is fixed per person). Keep the first; the second is a no-op,
            # not a refusal, so it never sits in a phone's quarantine.
            if old.get("reason") == "baseline" and data.get("reason") == "baseline":
                data.clear()
                data.update(old)
                return None
            return "the duty log cannot be changed once written"
        if data.get("_deleted"):
            return "the duty log cannot be deleted"
        if not data.get("crewId") or data.get("role") not in ("driver", "conductor"):
            return "a duty row needs a crew member and a seat"
        bus = data.get("busId")
        if bus is not None and not isinstance(bus, str):
            return "invalid bus"
        at = data.get("at")
        if not isinstance(at, (int, float)) or at > now_ms() + MAX_FUTURE_SKEW_MS:
            return "a duty row needs a real time"
        # Who made the change comes from the token, never the body.
        data["by"] = actor["id"]
        return None

    if store == "attendance":
        # A check-in is the evidence a late penalty is charged on. Staff used to
        # be able to rewrite or delete their own rows (clearing a late mark) and,
        # by id, a colleague's. Once written, only a manager changes one.
        if old and not manager:
            return "attendance cannot be changed once recorded"
        # Whose attendance this is comes from the token, never the body —
        # otherwise anyone can mark a colleague present who never came in.
        if not old:
            data["userId"] = actor["id"]
            # When the server received it. The check-in time itself comes from
            # the phone, corrected by the server clock it last saw; a time that
            # is well before arrival is marked, so a late check-in pushed from a
            # phone set back (or held offline) cannot pass as on time unseen.
            now = now_ms()
            data["receivedAt"] = now
            try:
                at = int(data.get("at") or 0)
            except (TypeError, ValueError):
                at = 0
            if not at or at > now + MAX_FUTURE_SKEW_MS:
                data["at"] = now
            elif now - at > ATTENDANCE_TRUST_MS:
                data["atUnverified"] = True
        return None

    if store in APPEND_ONLY_FOR_STAFF and not manager:
        if old:
            return "%s entries cannot be changed once recorded" % store
        if data.get("_deleted"):
            return "%s entries cannot be deleted" % store
        return None

    if store == "purchases" and not manager and old:
        if data.get("_deleted"):
            return "bills cannot be deleted"
        if not _same_except(old, data, PURCHASE_STAFF_FIELDS):
            return "a bill cannot be changed after it is entered, only marked paid"
        return None

    if store == "driverreports" and not manager:
        if not old:
            return None
        # The reporter can take back their own mistaken report while it is still
        # open and no job hangs off it (cancelReport in app.js). Nothing else.
        mine = old.get("_createdBy") == actor["id"]
        if not mine:
            crew = _crew_record_for(c, actor["id"])
            mine = bool(crew) and old.get("driverId") == crew.get("id")
        if not mine:
            return "only the person who filed a report may change it"
        if data.get("_deleted"):
            return "reports cannot be deleted"
        if old.get("status") != "open" or old.get("jobId"):
            return "this report is already being dealt with"
        if data.get("status") not in ("open", "cancelled") or data.get("jobId"):
            return "a report can only be cancelled by its reporter"
        if not _same_except(old, data, ("status", "resolvedAt")):
            return "a report's details cannot be changed"
        return None

    if store == "trips" and actor["role"] == "driver":
        # The driver's own cash session, and only while it is open. The allowance
        # handed over and the expenses already claimed are fixed once recorded.
        crew = _crew_record_for(c, actor["id"])
        if not crew:
            return "no crew record is linked to this login"
        if data.get("driverId") != crew.get("id") or (old and old.get("driverId") != crew.get("id")):
            return "a driver can only record their own trips"
        if data.get("_deleted"):
            return "trips cannot be deleted"
        if old:
            if old.get("status") == "closed":
                return "a closed trip cannot be changed"
            if not _same_except(old, data, ("expenses", "status", "closedAt")):
                return "a trip's bus, allowance and start cannot be changed"
            if data.get("status") not in ("active", "closed"):
                return "invalid trip status"
            before, after = old.get("expenses") or [], data.get("expenses") or []
            if not isinstance(after, list) or after[:len(before)] != before:
                return "expenses already claimed cannot be changed or removed"
        return None

    if store == "triplog" and actor["role"] == "driver":
        # A stop arrival is punctuality evidence. A driver may only log their own
        # bus, once per stop per day, and never rewrite or remove one.
        if old:
            return "a stop arrival cannot be changed once recorded"
        crew = _crew_record_for(c, actor["id"])
        if not crew or not crew.get("busId") or data.get("busId") != crew.get("busId"):
            return "a driver can only log arrivals for their own bus"
        if c is not None:
            for raw, in c.execute("SELECT data FROM records WHERE store='triplog'").fetchall():
                try:
                    t = json.loads(raw)
                except Exception:
                    continue
                if (isinstance(t, dict) and not t.get("_deleted") and t.get("busId") == data.get("busId")
                        and t.get("stopId") == data.get("stopId") and t.get("day") == data.get("day")):
                    return "this stop is already logged for today"
        return None

    if store == "meta":
        # `garage` is the shared settings row. Anything else in this store is a
        # device's own bookkeeping (the seed flag) and has no business travelling
        # between phones.
        if rid != "garage":
            return "only the garage settings are shared"
        return None

    if store == "crewnotes":
        # A record of a conversation that can be edited afterwards is worth
        # nothing: the note everybody remembers is the one that was changed
        # after the argument. Written once, kept as written.
        if old:
            return "a conversation note cannot be edited once written"
        if data.get("_deleted"):
            return "a conversation note cannot be deleted"
        if not str(data.get("crewId") or "").strip():
            return "a note must say who it is about"
        if not str(data.get("text") or "").strip():
            return "a note must say what was said"
        # The author is whoever is signed in, never whoever the body claims.
        data["by"] = actor["id"]
        return None

    if store == "ledger":
        # The stock ledger is the audit trail for parts leaving the store. It is
        # append-only: the people it audits must not be able to edit or delete a
        # row that incriminates them.
        if old:
            return "ledger is append-only"
        if data.get("_deleted"):
            return "ledger entries cannot be deleted"
        return None

    if store == "jobcards":
        status = data.get("status")
        prev = old.get("status")

        # A job card is what labour and parts are billed against, and removing
        # one is the only edit that leaves nothing behind to look at afterwards.
        # It is the owner's alone — not the supervisor's, who keeps the cards
        # and would be deleting their own work. The app only ever offers the
        # button in the owner's login; this is where that actually holds.
        if actor["role"] != "owner" and data.get("_deleted") and not old.get("_deleted"):
            return "only the owner may delete a job card"

        # Signed off means paid against. Staff may still attach a part the store
        # issued afterwards, but hours, outside cost and parts already on the card
        # are fixed until an owner or supervisor re-opens it.
        # `outside` is in this list because it decides whether a bus counts as
        # standing in our yard or away in another city. On a signed-off card
        # that is a statement about a repair that has been paid for, and it is
        # not the store login's to rewrite.
        if not manager and prev == "verified" and status == "verified":
            for f in ("labourHours", "externalCost", "externalVendor", "outside", "outsideCity"):
                if data.get(f) != old.get(f):
                    return "a verified job's hours and costs cannot be changed — re-open it first"
            new_lines = {}
            for l in data.get("partsUsed") or []:
                if isinstance(l, dict):
                    k = (l.get("partId"), bool(l.get("reused")))
                    new_lines[k] = new_lines.get(k, 0) + (l.get("qty") or 0)
            for l in old.get("partsUsed") or []:
                if isinstance(l, dict):
                    k = (l.get("partId"), bool(l.get("reused")))
                    if new_lines.get(k, 0) < (l.get("qty") or 0):
                        return "parts on a verified job cannot be removed or reduced — re-open it first"

        # A verified card is what a bill was paid against, and its bus is what
        # the repair's cost is charged to for good — both buses' cost per km
        # move with it. A supervisor correcting their own mis-pick would be
        # moving money after sign-off, so it is the owner's, and re-opening the
        # card (which unpicks the two-person check) is not needed for it.
        if prev == "verified" and status == "verified" and data.get("busId") != old.get("busId"):
            if actor["role"] != "owner":
                return "only an owner may move a verified job card to another bus"

        # Parts already issued stay on the card, whatever the incoming write
        # says. See _merge_parts_used: the write that drops one is a stale
        # device, not a correction, and the part is already out of the store.
        # The rule above still refuses a staff edit to a verified card outright,
        # so that case keeps its explanation instead of being quietly fixed.
        if not data.get("_deleted") and isinstance(old.get("partsUsed"), list):
            data["partsUsed"] = _merge_parts_used(old.get("partsUsed"), data.get("partsUsed"))

        # A mechanic works on the cards they are on, and only those.
        #
        # The app has always shown a mechanic just their own jobs, but the server
        # granted `jobcards` by role alone — so one crafted request could edit
        # any card in the garage: another mechanic's hours, a colleague's parts,
        # a job on a bus they have never touched. The rule is now held here.
        if actor["role"] == "mechanic":
            # Creating a card is how a job gets something to hang parts on. The
            # app gives a mechanic no way to do it; neither does the server.
            if not old:
                return "a mechanic cannot open a job card"
            if data.get("_deleted") and not old.get("_deleted"):
                return "a mechanic cannot delete a job card"
            # Membership is read from the card as it STANDS, never from the
            # body — otherwise "add myself to the crew" would be the way in.
            if actor["id"] not in _job_crew(old):
                return "you are not on this job"
            # Who is on the job is the supervisor's to set. Carry the stored
            # crew over whatever the body says, rather than refusing: a device
            # on an older build may send the card without `assignees`, and that
            # is a stale client, not an attack, so it must not cost the
            # mechanic the photos or hours in the same write.
            if "assignees" in old:
                data["assignees"] = old["assignees"]
            else:
                data.pop("assignees", None)
            data["assignedTo"] = old.get("assignedTo")

        # Reaching done/verified without photographs is the whole proof-of-work
        # rule. It has to hold here, not just in the browser.
        if status in ("done", "verified") and prev not in ("done", "verified"):
            if not _has_proof(data):
                return "job needs before and after photos (or a vendor bill) to close"

        # A verified job is the record a bill was paid against. Re-opening it is
        # how you edit a settled one: drop it back to open, add parts or hours,
        # and the cost of work that has already been signed off and paid quietly
        # changes. Sending a job back for rework is a real thing, so it is not
        # forbidden — but it is the two-person control's to do, not anyone with a
        # login who can write jobcards.
        if prev == "verified" and status != "verified":
            if actor["role"] not in ("owner", "supervisor"):
                return "only an owner or supervisor may re-open a verified job"

        # Closing is the supervisor's or the owner's. A mechanic can see the card
        # and what state it is in; they do not sign work off. The UI hides the
        # button, which stops an honest mistake — this stops the other thing.
        if status == "done" and prev != "done" and actor["role"] not in ("owner", "supervisor"):
            return "only an owner or supervisor may close a job"

        # Who closed it is server truth, so the two-person rule below cannot be
        # defeated by editing the field that it reads.
        if status == "done" and prev != "done":
            data["closedBy"] = actor["id"]
            data["closedAt"] = data.get("closedAt") or now_ms()
        else:
            data["closedBy"] = old.get("closedBy", data.get("closedBy"))

        if status == "verified" and prev != "verified":
            # Only the TRANSITION is an act of verifying. A job that is already
            # verified stays verified, and a later write that merely carries that
            # status along — the storekeeper attaching a part, say — is not
            # somebody signing off and must not be refused as if it were.
            if actor["role"] not in ("owner", "supervisor"):
                return "only an owner or supervisor may verify"
            closer = old.get("closedBy") or data.get("closedBy")
            # The supervisor's own work needs no second signature — the owner's
            # decision, 15 Sep 2026. The OWNER still may not sign off what the
            # owner closed. Photos are still required above; only the second
            # person is gone.
            if closer and closer == actor["id"] and actor["role"] != "supervisor":
                return "you closed this job — someone else must verify it"
            if actor["role"] == "supervisor" and prev not in ("done", "verified"):
                # Closed and signed off in one write: record who closed it from
                # the token, not the body, so the record still says who did it.
                data["closedBy"] = actor["id"]
                data["closedAt"] = old.get("closedAt") or data.get("closedAt") or now_ms()
            # Signing off is an identity claim; take it from the token.
            data["verifiedBy"] = actor["id"]
            data["verifiedAt"] = now_ms()
        elif status == "verified":
            # Already signed off: carry the original sign-off, ignore the body's.
            data["verifiedBy"] = old.get("verifiedBy")
            data["verifiedAt"] = old.get("verifiedAt")
        else:
            # Never let a body carry a sign-off it did not earn.
            if old.get("status") == "verified":
                data["verifiedBy"] = old.get("verifiedBy")
                data["verifiedAt"] = old.get("verifiedAt")
            else:
                data.pop("verifiedBy", None)
                data.pop("verifiedAt", None)
        return None

    return None



# ----------------------------- gate check ----------------------------------
# Mirrors GATE_ITEMS in gate.js — test_gatecheck.py fails if they drift apart.
GATE_ITEMS = [("ac", True), ("blankets", True), ("cabin", True), ("charging", False),
              ("water", False), ("tyres", False), ("fuel", False), ("papers", False),
              ("safety", False), ("uniform", False)]
# Who the check is about, and what the driver proved at the start. Fixed once written.
GATE_FIXED = ("busId", "regNo", "driverId", "driverName", "userId", "startedAt", "date",
              "selfie", "faceVerified", "lat", "lng", "onDutyBoard")


def _gate_outcome(items):
    """'pass', 'fail' or 'incomplete' — the same rule as Gate.outcome()."""
    items = items if isinstance(items, dict) else {}
    failed = False
    for key, needs_photo in GATE_ITEMS:
        it = items.get(key)
        if not isinstance(it, dict):
            return "incomplete"
        if it.get("ok") is True:
            if needs_photo and not it.get("photo"):
                return "incomplete"
        elif it.get("ok") is False:
            if not str(it.get("note") or "").strip():
                return "incomplete"
            failed = True
        else:
            return "incomplete"
    return "fail" if failed else "pass"


def _gate_failed(items):
    items = items if isinstance(items, dict) else {}
    return [k for k, _ in GATE_ITEMS if isinstance(items.get(k), dict) and items[k].get("ok") is False]


def _guard_gatecheck(data, actor, old, manager, c):
    """The rules of the departure checklist, enforced where a modified app
    cannot skip them. A driver can only fill in their own check and can only
    release it if every item passed; a failed one goes to the office. Only the
    owner or a supervisor decides go/hold, and only with a reason. Nobody can
    delete a check or change who did it, when, and the selfie that proved it."""
    if data.get("_deleted"):
        return "a gate check cannot be deleted"
    status, was = data.get("status"), (old or {}).get("status")
    if actor["role"] == "driver":
        crew = _crew_record_for(c, actor["id"])
        if not crew:
            return "no crew record is linked to this login"
        if data.get("driverId") != crew.get("id") or (old and old.get("driverId") != crew.get("id")):
            return "a driver can only fill in their own gate check"
        if data.get("decision") != (old or {}).get("decision"):
            return "only the office can approve or hold a bus"
        if not old:
            if status != "open":
                return "a gate check starts open"
            if not data.get("busId") or data.get("busId") != crew.get("busId"):
                return "a gate check is for the driver's own bus"
            at = data.get("startedAt")
            if not isinstance(at, (int, float)) or at > now_ms() + MAX_FUTURE_SKEW_MS:
                return "a gate check needs a real start time"
            data["userId"] = actor["id"]
            return None
        if any(data.get(k) != old.get(k) for k in GATE_FIXED):
            return "who did the check, when and the selfie cannot be changed"
        # Every item that has ever failed on this check stays on record, so a
        # re-check that turns a failed item into a pass is visible to the office.
        data["failedBefore"] = sorted(set(old.get("failedBefore") or []) | set(_gate_failed(old.get("items"))))
        if was not in ("open", "held"):
            if data != old and (status != was or data.get("items") != old.get("items")):
                return "this check is already with the office or released"
            return None
        sid = data.get("serviceId")
        if sid is not None and (not isinstance(sid, str) or len(sid) > 30 or _UNSAFE_ID.search(sid)):
            return "invalid service"
        if status == "open":
            return None
        verdict = _gate_outcome(data.get("items"))
        if status == "released":
            if verdict != "pass":
                return "a bus can only be released when every item passed"
            data["releasedAt"] = now_ms()
            return None
        if status == "awaiting":
            if verdict != "fail":
                return "only a check with a failed item goes to the office"
            data["sentAt"] = now_ms()
            return None
        return "invalid gate check status"
    if not manager:
        return "role may not write this store"
    # Owner / supervisor: decide go or hold on a check waiting for the office.
    if not old:
        return "a gate check is started by the driver at the bus"
    if was != "awaiting" or status not in ("approved", "held"):
        return "only a check waiting for the office can be approved or held"
    keep = {k: v for k, v in old.items()
            if k not in ("status", "decision", "pastDecisions", "updatedAt", "_by", "_byRole", "_org")}
    if any(data.get(k) != v for k, v in keep.items()):
        return "the office decides go or hold; it does not change the check"
    dec = data.get("decision")
    if not isinstance(dec, dict) or not str(dec.get("reason") or "").strip():
        return "approving or holding a bus needs a reason"
    dec["by"] = actor["id"]
    dec["byRole"] = actor["role"]
    dec["at"] = now_ms()
    dec["verdict"] = "go" if status == "approved" else "hold"
    # A hold, then a re-check, then a go: the hold stays on record.
    past = list(old.get("pastDecisions") or [])
    if isinstance(old.get("decision"), dict):
        past.append(old["decision"])
    data["pastDecisions"] = past
    return None


# ----------------------------- redPro ingest --------------------------------
# The office collector reads redPro (redBus's operator portal) with the office's
# own login and posts what it read here: reviews, complaints, redBus's vehicle/
# driver assignment for today, and the list of services. Garage Saathi then
# traces a review to a bus and a crew (trace.js). Only the collector writes
# these stores (SERVER_INGEST_ONLY); every phone just reads them.
#
# Passengers' names, phones and e-mails never reach this server: the collector
# drops them, and every row is rebuilt here from an allow-list of fields, so a
# collector that ever sent them would still have them thrown away.
def _read_secret(env_name, filename):
    t = os.environ.get(env_name, "").strip()
    if t:
        return t
    for p in (os.path.join(os.path.dirname(os.path.abspath(__file__)), filename),
              "/etc/secrets/" + env_name):
        try:
            with open(p) as f:
                v = f.read().strip()
                if v:
                    return v
        except Exception:
            pass
    return ""


REDPRO_INGEST_TOKEN = _read_secret("REDPRO_INGEST_TOKEN", ".redpro_ingest_token")
_REDPRO_TOKEN_OK = len(REDPRO_INGEST_TOKEN) >= 24
# The scheduler's token (GitHub Actions, .github/workflows/ai-jobs.yml): it can only START the AI
# jobs (/ai/reviews, /ai/names, /ai/gate, /ai/core, /ai/reports, /ai/coaching, /ai/digest), never
# write data, so a leak of it costs at most some Claude calls, which each job caps per day.
AI_CRON_TOKEN = os.environ.get("AI_CRON_TOKEN", "").strip()


def _ai_trigger_ok(auth_header):
    """A machine allowed to start the AI jobs: the redPro extension or the scheduler."""
    if _REDPRO_TOKEN_OK and hmac.compare_digest(auth_header, "Bearer " + REDPRO_INGEST_TOKEN):
        return True
    return len(AI_CRON_TOKEN) >= 24 and hmac.compare_digest(auth_header, "Bearer " + AI_CRON_TOKEN)
REDPRO_STORES = ("rbservices", "rbreviews", "rbcomplaints", "rbassign")
_REDPRO_MAX_ROWS = 2000           # one request; the collector pages bigger pulls


def _s(v, n=200):
    return v.strip()[:n] if isinstance(v, str) else ("" if v is None else str(v)[:n])


def _ist_day(ms):
    return time.strftime("%Y-%m-%d", time.gmtime(ms / 1000 + 5.5 * 3600))


def _clean_review(r):
    rid = _s(r.get("reviewId") or r.get("tin"), 60)
    if not rid or _UNSAFE_ID.search(rid):
        return None
    stars = r.get("stars")
    return {"id": "rv-" + rid, "reviewId": rid, "tin": _s(r.get("tin"), 40), "pnr": _s(r.get("pnr"), 30),
            "routeId": _s(r.get("routeId"), 30), "source": _s(r.get("source"), 80), "dest": _s(r.get("dest"), 80),
            "boardAt": _s(r.get("boardAt"), 25), "fare": _s(r.get("fare"), 20),
            "seats": [_s(x, 10) for x in (r.get("seats") or [])][:12],
            "stars": stars if isinstance(stars, (int, float)) and 1 <= stars <= 5 else None,
            "submittedOn": _s(r.get("submittedOn"), 25), "comment": _s(r.get("comment"), 2000),
            "tags": [_s(x, 60) for x in (r.get("tags") or [])][:12],
            "reviewStatus": _s(r.get("reviewStatus"), 30), "replied": bool(r.get("replied"))}


def _clean_complaint(r):
    cn = _s(r.get("caseNumber"), 40)
    if not cn or _UNSAFE_ID.search(cn):
        return None
    return {"id": "cs-" + cn, "caseNumber": cn, "pnr": _s(r.get("pnr"), 30), "doj": _s(r.get("doj"), 25),
            "createdAt": _s(r.get("createdAt"), 25), "status": _s(r.get("status"), 40),
            "issue": _s(r.get("issue"), 200), "source": _s(r.get("source"), 80), "dest": _s(r.get("dest"), 80),
            "amount": _s(r.get("amount"), 30), "seats": r.get("seats") if isinstance(r.get("seats"), int) else None,
            "resolution": _s(r.get("resolution"), 200), "refundStatus": _s(r.get("refundStatus"), 80),
            # Agent notes only: who wrote them is dropped (agents are people too).
            "notes": [{"at": _s(n.get("at"), 25), "text": _s(n.get("text"), 1000)}
                      for n in (r.get("notes") or []) if isinstance(n, dict)][:30]}


def _clean_assign(r):
    sid = _s(r.get("serviceId"), 30)
    if not sid or _UNSAFE_ID.search(sid):
        return None
    return {"serviceId": sid, "serviceNo": _s(r.get("serviceNo"), 80), "origin": _s(r.get("origin"), 80),
            "dest": _s(r.get("dest"), 80), "startTime": _s(r.get("startTime"), 8),
            "vehicleNo": _s(r.get("vehicleNo"), 20).upper(), "driver1": _s(r.get("driver1"), 60),
            "driver2": _s(r.get("driver2"), 60), "cro": _s(r.get("cro"), 60),
            "isRunning": bool(r.get("isRunning", True))}


def _clean_service(r):
    sid = _s(r.get("serviceId"), 30)
    if not sid or _UNSAFE_ID.search(sid):
        return None
    out = {"serviceNo": _s(r.get("serviceNo"), 80), "origin": _s(r.get("origin"), 80), "dest": _s(r.get("dest"), 80),
           "startTime": _s(r.get("startTime"), 8), "label": _s(r.get("label"), 120)}
    out = {k: v for k, v in out.items() if v}
    rids = [_s(x, 30) for x in (r.get("routeIds") or []) if _s(x, 30)]
    if rids:
        # The biggest services carry ~400 via-routes (16 Oct 2026); leave room.
        out["routeIds"] = rids[:1000]
    return sid, out


def ingest_redpro(body, now=None):
    """Apply one collector post. Returns counts. Records are written with a
    fresh rev so every device pulls them like any other change."""
    now = now or now_ms()
    kind = (body or {}).get("kind")
    rows = (body or {}).get("rows")
    if kind not in ("reviews", "complaints", "assignments", "services") or not isinstance(rows, list):
        return {"ok": False, "error": "expected {kind: reviews|complaints|assignments|services, rows: [...]}"}
    if len(rows) > _REDPRO_MAX_ROWS:
        return {"ok": False, "error": "too many rows in one post (max %d)" % _REDPRO_MAX_ROWS}
    cap = body.get("capturedAt")
    cap = int(cap) if isinstance(cap, (int, float)) and now - 7 * 86400000 < cap <= now + MAX_FUTURE_SKEW_MS else now
    written = skipped = 0
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]

        def get(store, rid):
            row = c.execute("SELECT data FROM records WHERE store=? AND id=?", (store, rid)).fetchone()
            try:
                return json.loads(row[0]) if row else None
            except Exception:
                return None

        def put(store, rec):
            nonlocal rev, written
            rec["updatedAt"] = now
            rec["_by"] = "redpro-collector"
            rec["_org"] = "mahalaxmi"
            rev = _upsert_record(c, store, rec["id"], rec, now, rev)
            written += 1

        for r in rows:
            if not isinstance(r, dict):
                skipped += 1
                continue
            if kind == "reviews":
                rec = _clean_review(r)
                if not rec:
                    skipped += 1
                    continue
                old = get("rbreviews", rec["id"])
                rec["firstSeen"] = (old or {}).get("firstSeen") or cap
                if old and all(old.get(k) == rec.get(k) for k in rec if k != "firstSeen"):
                    continue                     # unchanged: no new rev, no re-download on every phone
                put("rbreviews", rec)
            elif kind == "complaints":
                rec = _clean_complaint(r)
                if not rec:
                    skipped += 1
                    continue
                old = get("rbcomplaints", rec["id"])
                rec["firstSeen"] = (old or {}).get("firstSeen") or cap
                if old and all(old.get(k) == rec.get(k) for k in rec if k != "firstSeen"):
                    continue
                put("rbcomplaints", rec)
            elif kind == "assignments":
                a = _clean_assign(r)
                if not a:
                    skipped += 1
                    continue
                day = _ist_day(cap)
                rid = "as-%s-%s" % (a["serviceId"], day)
                old = get("rbassign", rid) or {"id": rid, "serviceId": a["serviceId"], "date": day, "obs": []}
                obs = list(old.get("obs") or [])
                cur = {k: a[k] for k in ("vehicleNo", "driver1", "driver2", "cro")}
                last = obs[-1] if obs else None
                # One observation per change, not per snapshot: a day of 30-minute
                # snapshots of an unchanged row stays one entry.
                if not last or any(last.get(k) != v for k, v in cur.items()):
                    obs.append(dict(cur, at=cap))
                    old["obs"] = obs[-48:]
                    old["serviceNo"], old["startTime"] = a["serviceNo"], a["startTime"]
                    put("rbassign", old)
                # The assignment list is also the freshest description of the service.
                svc = get("rbservices", a["serviceId"]) or {"id": a["serviceId"]}
                upd = {"serviceNo": a["serviceNo"], "origin": a["origin"], "dest": a["dest"], "startTime": a["startTime"],
                       # Lets the gate check suggest this service first to the driver of that bus.
                       "lastVehicle": a["vehicleNo"]}
                upd = {k: v for k, v in upd.items() if v and svc.get(k) != v}
                if upd:
                    svc.update(upd)
                    put("rbservices", svc)
            else:
                got = _clean_service(r)
                if not got:
                    skipped += 1
                    continue
                sid, fields = got
                svc = get("rbservices", sid) or {"id": sid}
                if "routeIds" in fields:
                    fields["routeIds"] = sorted(set(svc.get("routeIds") or []) | set(fields["routeIds"]))
                upd = {k: v for k, v in fields.items() if svc.get(k) != v}
                if upd:
                    svc.update(upd)
                    put("rbservices", svc)
        c.commit()
        c.close()
    return {"ok": True, "kind": kind, "written": written, "skipped": skipped, "maxRev": rev}


# ----------------------------- redBus name -> crew ---------------------------
def _norm_name(s):
    """Same key as Trace.normName in trace.js: lower case, letters and digits, single spaces."""
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _alias_id(name, reg):
    """One answer per typed name per bus. Matches Trace.aliasId; test_rbalias.py checks the two agree."""
    return "al-%s-%s" % (norm_reg(re.sub(r"[^A-Za-z0-9]", "", str(reg or ""))), _norm_name(name).replace(" ", "_"))


def _guard_rbalias(data, actor, old, c):
    """A confirmed match between a driver name typed in redPro and one of our crew. It decides who a
    review is traced to, so: it must name a real crew record (or say the name is nobody, like
    "Staff"), one record per name per bus, never deleted, and every change keeps the one before."""
    if data.get("_deleted"):
        return "a confirmed name cannot be deleted; mark it as someone else or as not a name"
    name, reg = str(data.get("name") or "").strip(), str(data.get("regNo") or "").strip()
    if not _norm_name(name) or not reg or len(name) > 60:
        return "a confirmed name needs the name and the bus"
    if data.get("id") != _alias_id(name, reg):
        return "this name and bus already have their own record"
    if old and (old.get("name") != data.get("name") or old.get("regNo") != data.get("regNo")):
        return "the name and the bus of a confirmed match cannot be changed"
    if data.get("role") not in ("driver", "conductor"):
        return "invalid seat"
    status = data.get("status")
    # Written by a person: whatever Claude decided before is theirs now (history keeps Claude's).
    for k in ("auto", "reason", "evidence"):
        data.pop(k, None)
    if status in ("generic", "unsure"):
        data["crewId"] = None
    elif status == "crew":
        cid = data.get("crewId")
        row = c.execute("SELECT data FROM records WHERE store='drivers' AND id=?", (cid,)).fetchone() if (c and isinstance(cid, str)) else None
        try:
            rec = json.loads(row[0]) if row else None
        except Exception:
            rec = None
        if not rec or rec.get("_deleted"):
            return "that crew member is not in the crew bank"
    else:
        return "invalid status"
    data["decidedBy"] = actor["id"]
    data["decidedAt"] = now_ms()
    if old and (old.get("crewId") != data.get("crewId") or old.get("status") != status):
        hist = list(old.get("history") or [])
        hist.append({k: old.get(k) for k in ("crewId", "status", "decidedBy", "decidedAt", "reason")})
        data["history"] = hist[-20:]
    elif old:
        data["history"] = old.get("history") or []
    return None


# ----------------------------- ITS PNR fallback ----------------------------
try:
    import its_lookup
except Exception:                     # noqa: BLE001 - a missing module costs the fallback, not the server
    its_lookup = None

ITS_BATCH_MAX = 10                    # PNRs per request: ~2 ITS pages each, well inside a 60 s function
ITS_BUDGET_S = 40
ITS_RECHECK_NOT_FOUND_MS = 86400000   # a PNR ITS did not know is asked again after a day, not every time
# Bumped whenever the lookup itself is fixed: "not found" from an older version may have been the bug
# (v1 posted dropdowns empty and crashed ITS's page on every PNR, 16-17 Oct 2026), so those are asked again.
# A found PNR whose driver did not match is asked again: after the office adds a number to the crew
# bank (an hour), or enters the driver's number in ITS (a day). Matched PNRs are never asked again.
ITS_RECHECK_UNMATCHED_MS = {"not-in-crew-bank": 3600000, "number-shared": 3600000, "no-driver-number": 86400000}
ITS_LOOKUP_VERSION = 3   # v3 records WHY a found PNR's driver did not match (matchReason)


def _crew_match(c, phone):
    """(crew record or None, reason). Reason is one of: matched, no-driver-number,
    not-in-crew-bank, number-shared. Exact number, never a name."""
    if not phone:
        return None, "no-driver-number"
    hits = _crew_hits(c, phone)
    if len(hits) == 1:
        return hits[0], "matched"
    return None, ("number-shared" if hits else "not-in-crew-bank")


def _crew_by_phone(c, phone):
    """The crew record whose phone (or alternate phone) is this number. Exact number, never a name."""
    if not phone:
        return None
    hits = _crew_hits(c, phone)
    return hits[0] if len(hits) == 1 else None


def _crew_hits(c, phone):
    hits = []
    for raw, in c.execute("SELECT data FROM records WHERE store='drivers'").fetchall():
        try:
            d = json.loads(raw)
        except Exception:
            continue
        if not isinstance(d, dict) or d.get("_deleted"):
            continue
        if phone in (its_lookup.phone10(d.get("phone")), its_lookup.phone10(d.get("altPhone"))):
            hits.append(d)
    # Two crew records with one number is a data problem; naming either would be a guess.
    return hits


def its_lookup_batch(pnrs, actor, session_factory=None, clock=time.monotonic):
    """Look PNRs up in ITS and keep, per PNR, the trip and the crew member the driver's number
    belongs to. The driver's number is kept masked; passenger details are never kept.
    Returns (status, payload)."""
    if its_lookup is None:
        return 501, {"error": "its_lookup.py is missing on the server"}
    if not its_lookup.configured() and session_factory is None:
        return 503, {"error": "ITS lookups are off: set ITS_LOOKUP_USER and ITS_LOOKUP_PASSWORD in Vercel"}
    want = []
    for p in pnrs or []:
        p = str(p).strip()
        if re.fullmatch(r"\d{5,15}", p) and p not in want:
            want.append(p)
    if not want:
        return 400, {"error": "expected {pnrs: [digits, ...]}"}
    want = want[:ITS_BATCH_MAX]
    now = now_ms()
    c = db()
    try:
        todo = []
        for p in want:
            row = c.execute("SELECT data FROM records WHERE store='itslookup' AND id=?", ("it-" + p,)).fetchone()
            old = json.loads(row[0]) if row else None
            # Asked again: anything from an older lookup that did not end in a matched driver.
            if old and old.get("crewId"):
                continue                                        # driver matched: done
            if old and old.get("v", 1) >= ITS_LOOKUP_VERSION:
                wait = ITS_RECHECK_UNMATCHED_MS.get(old.get("matchReason"), ITS_RECHECK_NOT_FOUND_MS)
                if now - (old.get("lookedUpAt") or 0) < wait:
                    continue
            todo.append(p)
    finally:
        c.close()
    done, found, matched, error = [], 0, 0, None
    if todo:
        t0 = clock()
        try:
            sess = (session_factory or its_lookup.Session)()
            for p in todo:
                if clock() - t0 > ITS_BUDGET_S:
                    break
                trip = sess.lookup(p)
                done.append((p, trip))
        except its_lookup.ItsError as e:
            error = str(e)[:200]
        except Exception as e:            # noqa: BLE001 - ITS down or changed: report it, keep what was read
            error = "ITS did not answer as expected: " + str(e)[:160]
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        for p, trip in done:
            crew, why = _crew_match(c, trip.get("driverPhone")) if trip else (None, "pnr-not-found")
            rec = {"id": "it-" + p, "pnr": p, "found": bool(trip), "lookedUpAt": now, "by": actor["id"], "v": ITS_LOOKUP_VERSION,
                   "_by": "its-lookup", "_org": "mahalaxmi", "updatedAt": now}
            if trip:
                found += 1
                ph = trip.pop("driverPhone", "")
                rec.update(trip)
                rec["driverPhoneMasked"] = ("•••••• " + ph[-4:]) if ph else ""
                rec["crewId"] = crew.get("id") if crew else None
                matched += 1 if crew else 0
            rec["matchReason"] = why
            rev = _upsert_record(c, "itslookup", rec["id"], rec, now, rev)
        c.commit()
        c.close()
    out = {"ok": error is None, "asked": len(want), "lookedUp": len(done), "found": found, "driverMatched": matched,
           "skipped": len(want) - len(todo), "left": len(todo) - len(done)}
    if error:
        out["error"] = error
    return (200 if error is None or done else 502), out


# ----------------------------- Review fault reading -------------------------------------------
# Claude reads each redBus review once and says whose fault the complaint is (review_ai.py). New
# reviews go a chunk at a time; a backlog (the first 4,700) goes as one Message Batch, at half the
# price, collected on a later call. Called by the redPro extension after each review sync and by
# the owner's reviews screen, so it runs without anyone pressing a button.
AI_REVIEW_BATCH_MIN = int(os.environ.get("AI_REVIEW_BATCH_MIN", "120"))   # backlog size that goes as a batch
AI_REVIEW_BATCH_MAX = 6000
AI_REVIEW_DAILY_CALLS = int(os.environ.get("AI_REVIEW_DAILY_CALLS", "200"))  # direct calls a day (15 reviews each)
_ANTHROPIC = "https://api.anthropic.com/v1"


def _anthropic(method, path, payload=None, timeout=50):
    req = urllib.request.Request(_ANTHROPIC + path, method=method,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY,
                                          "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", "replace")
    return raw if path.endswith("/results") else json.loads(raw)


def _ai_day_count(c, bump=0):
    key = "reviews:%s" % datetime.utcnow().strftime("%Y-%m-%d")
    row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
    n = int(row[0]) if row else 0
    if bump:
        c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + bump))
    return n


def _store_rows(c, store):
    out = {}
    for rid, raw in c.execute("SELECT id, data FROM records WHERE store=?", (store,)).fetchall():
        try:
            d = json.loads(raw)
        except Exception:
            continue
        if isinstance(d, dict) and not d.get("_deleted"):
            out[rid] = d
    return out


def _save_readings(c, reviews_by_id, readings, model):
    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
    now = now_ms()
    for rid, reading in readings.items():
        rv = reviews_by_id.get(rid)
        if rv:
            rec = review_ai.record_for(rv, reading, model, now)
            rev = _upsert_record(c, "rbreviewai", rec["id"], rec, now, rev)
    return len(readings)


def review_ai_diag(call=None):
    """The errors Anthropic gave for the last batch: for finding out why it failed. No review text."""
    call = call or _anthropic
    with _lock:
        c = db()
        try:
            meta = _store_rows(c, "aimeta").get("rv-batch") or {}
        finally:
            c.close()
    bid = meta.get("batchId") or meta.get("lastBatch")
    # Counts only, no text: how the readings split by whose fault.
    with _lock:
        c = db()
        try:
            got = list(_store_rows(c, "rbreviewai").values())
        finally:
            c.close()
    summary = {"read": len(got), "noComplaint": sum(1 for a in got if not a.get("faults")), "safety": sum(1 for a in got if a.get("safety")),
               "crewFault": sum(1 for a in got if set(a.get("faults") or []) & {"driver", "conductor", "crew"}),
               "notCrew": sum(1 for a in got if a.get("faults") and not set(a["faults"]) & {"driver", "conductor", "crew"})}
    for a in got:
        for f in a.get("faults") or []:
            summary["f_" + f] = summary.get("f_" + f, 0) + 1
    if not bid:
        return 200, {"ok": True, "batch": None, "summary": summary}
    st = call("GET", "/messages/batches/" + bid, None)
    out = {"ok": True, "batch": bid, "status": st.get("processing_status"), "counts": st.get("request_counts"),
           "lastError": meta.get("lastError"), "pauseUntil": meta.get("pauseUntil"), "errors": [], "summary": summary}
    if st.get("processing_status") == "ended":
        for line in (call("GET", "/messages/batches/%s/results" % bid, None) or "").splitlines()[:400]:
            try:
                res = (json.loads(line).get("result") or {})
            except Exception:
                continue
            if res.get("type") != "succeeded" and len(out["errors"]) < 3:
                out["errors"].append(json.dumps(res.get("error") or res)[:400])
    return 200, out


def review_ai_retry():
    """Clear a pause, so the next tick sends the backlog again (after a fix ships)."""
    with _lock:
        c = db()
        try:
            meta = _store_rows(c, "aimeta").get("rv-batch") or {"id": "rv-batch"}
            if meta.get("batchId"):
                return 409, {"error": "a batch is still open"}
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "aimeta", "rv-batch", dict(meta, pauseUntil=None), now_ms(), rev)
            c.commit()
        finally:
            c.close()
    return 200, {"ok": True}


def review_ai_tick(call=None):
    """One step of the job. Returns (status, body). `call(method, path, payload)` is the API (tests
    pass a fake)."""
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    out = {"ok": True, "classified": 0, "batch": None}
    with _lock:
        c = db()
        try:
            reviews = _store_rows(c, "rbreviews")
            readings = _store_rows(c, "rbreviewai")
            meta = _store_rows(c, "aimeta").get("rv-batch")
        finally:
            c.close()

    # 1. An open batch: collect it once Anthropic has finished.
    in_batch = set()
    if meta and meta.get("batchId"):
        st = call("GET", "/messages/batches/" + meta["batchId"], None)
        if st.get("processing_status") == "ended":
            text = call("GET", "/messages/batches/%s/results" % meta["batchId"], None)
            got, ok_n, bad_n, first_err = {}, 0, 0, None
            for line in (text or "").splitlines():
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                ids = (meta.get("chunks") or {}).get(row.get("custom_id")) or []
                res = row.get("result") or {}
                if res.get("type") != "succeeded":
                    bad_n += 1
                    if first_err is None:
                        err = (res.get("error") or {})
                        err = err.get("error") or err          # {"type": "error", "error": {type, message}}
                        first_err = ("%s: %s" % (err.get("type") or res.get("type"), err.get("message") or ""))[:300]
                    continue
                ok_n += 1
                chunk = [reviews[i] for i in ids if i in reviews]
                # Only a reading of the text that was sent: a review edited since is asked again.
                hashes = (meta.get("hashes") or {})
                chunk = [r for r in chunk if hashes.get(r["id"]) == review_ai.content_hash(r)]
                got.update(review_ai.parse_message(res.get("message"), chunk))
            with _lock:
                c = db()
                try:
                    out["classified"] += _save_readings(c, reviews, got, meta.get("model") or AI_MODEL)
                    rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                    # A batch that mostly failed is never sent again by itself: the job pauses and says why.
                    failed = bad_n and bad_n >= ok_n
                    _upsert_record(c, "aimeta", "rv-batch", {"id": "rv-batch", "batchId": None, "lastBatch": meta["batchId"],
                                                             "lastCollected": len(got), "lastOk": ok_n, "lastFailed": bad_n,
                                                             "lastError": first_err, "at": now_ms(),
                                                             "pauseUntil": now_ms() + 6 * 3600000 if failed else None}, now_ms(), rev)
                    c.commit()
                finally:
                    c.close()
            readings = dict(readings, **{"ai-" + k: {"v": review_ai.PROMPT_V, "h": review_ai.content_hash(reviews[k])} for k in got})
            out["batch"] = {"collected": len(got), "id": meta["batchId"], "ok": ok_n, "failed": bad_n, "error": first_err}
            meta = {"pauseUntil": now_ms() + 6 * 3600000 if (bad_n and bad_n >= ok_n) else None, "lastError": first_err}
        else:
            in_batch = {i for ids in (meta.get("chunks") or {}).values() for i in ids}
            out["batch"] = {"id": meta["batchId"], "status": st.get("processing_status"),
                            "counts": st.get("request_counts"), "reviews": len(in_batch)}

    todo = review_ai.pending(list(reviews.values()), readings, skip=in_batch)
    paused = bool(meta and meta.get("pauseUntil") and meta["pauseUntil"] > now_ms())
    if paused:
        # The last batch failed: no new batch and no direct calls until the pause ends (or a fix ships
        # and the owner clears it with {"retry": true}).
        out.update(paused=True, error=meta.get("lastError"), pending=len(todo))
        return 200, out

    # 2. A backlog and no batch open: send it all as one batch.
    if len(todo) >= AI_REVIEW_BATCH_MIN and not in_batch:
        todo = todo[:AI_REVIEW_BATCH_MAX]
        parts = review_ai.chunks(todo)
        reqs = [{"custom_id": "c%d" % n, "params": review_ai.params_for(ch, AI_MODEL)} for n, ch in enumerate(parts)]
        b = call("POST", "/messages/batches", {"requests": reqs})
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "aimeta", "rv-batch", {
                    "id": "rv-batch", "batchId": b.get("id"), "model": AI_MODEL, "at": now_ms(),
                    "chunks": {"c%d" % n: [r["id"] for r in ch] for n, ch in enumerate(parts)},
                    "hashes": {r["id"]: review_ai.content_hash(r) for r in todo}}, now_ms(), rev)
                c.commit()
            finally:
                c.close()
        out["batch"] = {"id": b.get("id"), "status": b.get("processing_status"), "reviews": len(todo), "started": True}
        out["pending"] = 0
        return 200, out

    # 3. A few new reviews: read one chunk now.
    if todo:
        with _lock:
            c = db()
            try:
                if _ai_day_count(c) >= AI_REVIEW_DAILY_CALLS:
                    out["limited"] = True
                else:
                    _ai_day_count(c, bump=1)
                    c.commit()
            finally:
                c.close()
        if not out.get("limited"):
            chunk = todo[:review_ai.CHUNK]
            msg = call("POST", "/messages", review_ai.params_for(chunk, AI_MODEL))
            got = review_ai.parse_message(msg, chunk)
            with _lock:
                c = db()
                try:
                    out["classified"] += _save_readings(c, reviews, got, AI_MODEL)
                    c.commit()
                finally:
                    c.close()
            todo = todo[len(chunk):] if got else todo
    out["pending"] = len(todo)
    out["done"] = sum(1 for r in reviews.values() if review_ai.has_text(r)) - len(todo) - len(in_batch)
    return 200, out


# ----------------------------- redBus name matching ---------------------------------------------
# Claude reads each unconfirmed typed name against the crew bank and the duty log (name_ai.py). A
# strong match is confirmed by itself (the owner's decision, 18 Oct 2026); the rest are suggestions
# on the Confirm redBus names screen. A name a person has decided is never touched.
AI_NAMES_DAILY_CALLS = int(os.environ.get("AI_NAMES_DAILY_CALLS", "60"))


def names_ai_tick(call=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    with _lock:
        c = db()
        try:
            assign = list(_store_rows(c, "rbassign").values())
            aliases = _store_rows(c, "rbalias")
            answers = _store_rows(c, "rbaliasai")
            crew = [d for d in _store_rows(c, "drivers").values() if (d.get("status") or "active") == "active"]
            ctx = crew_trace.Context([], [], [], list(_store_rows(c, "buses").values()),
                                     list(_store_rows(c, "dutylog").values()), [], [])
        finally:
            c.close()
    todo = []
    for pid, pair in name_ai.pairs_from(assign).items():
        if pid in aliases:
            continue
        cands, nights = name_ai.evidence(pair, ctx, crew)
        eh = name_ai.evidence_hash(pair, cands, nights)
        old = answers.get(pid)
        # Asked again when the evidence changes (more nights, a new duty-log entry) or the prompt does.
        if old and old.get("v") == name_ai.PROMPT_V and old.get("eh") == eh:
            continue
        todo.append({"pair": pair, "cands": cands, "nights": nights, "eh": eh})
    todo.sort(key=lambda it: -it["nights"])
    out = {"ok": True, "asked": 0, "confirmed": 0, "generic": 0, "suggested": 0}
    if todo:
        key = "names:%s" % datetime.utcnow().strftime("%Y-%m-%d")
        with _lock:
            c = db()
            try:
                row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
                n = int(row[0]) if row else 0
                if n >= AI_NAMES_DAILY_CALLS:
                    out["limited"] = True
                else:
                    c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
                    c.commit()
            finally:
                c.close()
    if todo and not out.get("limited"):
        items = todo[:name_ai.CHUNK]
        got = name_ai.parse_message(call("POST", "/messages", name_ai.params_for(items, AI_MODEL)), items)
        now = now_ms()
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                for it in items:
                    a = got.get(it["pair"]["id"])
                    if not a:
                        continue
                    out["asked"] += 1
                    pid = it["pair"]["id"]
                    on = next((x["onBus"] for x in it["cands"] if x["crewId"] == a["pick"]), 0)
                    rev = _upsert_record(c, "rbaliasai", pid, dict(a, id=pid, v=name_ai.PROMPT_V, eh=it["eh"], at=now,
                                                                   model=AI_MODEL, nights=it["nights"], onBus=on), now, rev)
                    verdict = name_ai.decide(a, it["cands"], it["nights"])
                    exists = c.execute("SELECT 1 FROM records WHERE store='rbalias' AND id=?", (pid,)).fetchone()
                    if verdict and not exists:
                        p = it["pair"]
                        rev = _upsert_record(c, "rbalias", pid, {
                            "id": pid, "name": p["name"], "regNo": p["regNo"], "role": p["role"], "status": verdict,
                            "crewId": a["pick"] if verdict == "crew" else None, "decidedBy": "claude", "decidedAt": now,
                            "auto": True, "reason": a["reason"], "evidence": {"nights": it["nights"], "onBus": on}}, now, rev)
                        out["confirmed" if verdict == "crew" else "generic"] += 1
                    else:
                        out["suggested"] += 1
                c.commit()
            finally:
                c.close()
        todo = todo[len(items):]
    out["pending"] = len(todo)
    return 200, out


# ----------------------------- Gate check photos -----------------------------------------------
# Claude looks at each submitted gate check's AC, blanket and cabin photos (gate_ai.py) and says
# whether each shows what it must; the code flags a photo used twice. The office sees the flags; no
# check is held or released because of them. Run by the redPro extension's 10-minute tick and by
# the office's gate screens.
AI_GATE_DAYS = 7
AI_GATE_PER_CALL = 2                  # checks per request: ~3 images each, well inside 60 s
AI_GATE_DAILY_CALLS = int(os.environ.get("AI_GATE_DAILY_CALLS", "300"))


def gate_ai_tick(call=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    with _lock:
        c = db()
        try:
            checks = list(_store_rows(c, "gatechecks").values())
            readings = _store_rows(c, "gateai")
        finally:
            c.close()
    # Every photo ever used, earliest first: a photo seen again later is a repeat.
    earlier = {}
    for ch in sorted(checks, key=lambda x: x.get("startedAt") or 0):
        for k, p in gate_ai.photos_of(ch).items():
            earlier.setdefault(p, (ch.get("id"), k))
    since = now_ms() - AI_GATE_DAYS * 86400000
    todo = []
    for ch in checks:
        if not gate_ai.is_submitted(ch) or (ch.get("startedAt") or 0) < since:
            continue
        photos = gate_ai.photos_of(ch)
        if not photos:
            continue
        old = readings.get("ga-" + ch["id"])
        if old and old.get("v") == gate_ai.PROMPT_V and old.get("h") == gate_ai.photos_hash(photos):
            continue
        todo.append(ch)
    todo.sort(key=lambda x: -(x.get("startedAt") or 0))
    out = {"ok": True, "checked": 0, "flagged": 0}
    for ch in todo[:AI_GATE_PER_CALL]:
        with _lock:
            c = db()
            try:
                key = "gate:%s" % datetime.utcnow().strftime("%Y-%m-%d")
                row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
                n = int(row[0]) if row else 0
                if n >= AI_GATE_DAILY_CALLS:
                    out["limited"] = True
                    break
                c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
                c.commit()
            finally:
                c.close()
        params, keys = gate_ai.params_for(ch, AI_MODEL)
        err = None
        try:
            items = gate_ai.parse_message(call("POST", "/messages", params), keys) if params else {}
        except urllib.error.HTTPError as e:
            if e.code != 400:
                raise
            # Claude could not open a photo (a broken link): say so once, not every ten minutes.
            items, err = {}, "photos could not be opened"
        if params and not err and len(items) < len(keys):
            continue                      # an incomplete answer is asked again next time
        dup = gate_ai.duplicates(ch, earlier)
        rec = {"id": "ga-" + ch["id"], "check": ch["id"], "busId": ch.get("busId"), "v": gate_ai.PROMPT_V,
               "h": gate_ai.photos_hash(gate_ai.photos_of(ch)), "items": items, "dup": dup, "error": err, "model": AI_MODEL, "at": now_ms()}
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "gateai", rec["id"], rec, now_ms(), rev)
                c.commit()
            finally:
                c.close()
        out["checked"] += 1
        if dup or any(v["verdict"] != "ok" for v in items.values()):
            out["flagged"] += 1
    out["pending"] = max(0, len(todo) - out["checked"])
    return 200, out


# ----------------------------- Supplier bills ---------------------------------------------------
# Claude reads a photographed bill (bill_ai.py); the code checks its arithmetic; the store person
# reviews the pre-filled purchase form and saves. Nothing is stored here: the bill is saved by the
# app, as before, with the photo.
AI_BILL_DAILY = int(os.environ.get("AI_BILL_DAILY", "60"))     # bills read per person per day


def read_bill(actor, photo, call=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    if actor.get("role") not in ("owner", "supervisor", "store"):
        return 403, {"error": "forbidden"}
    image = gate_ai.image_block(photo)
    if not image or len(photo) > 7_000_000:
        return 400, {"error": "send the bill photo as a link or a JPEG/PNG data URL under 5 MB"}
    key = "bill:%s:%s" % (actor["id"], datetime.utcnow().strftime("%Y-%m-%d"))
    with _lock:
        c = db()
        try:
            row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
            n = int(row[0]) if row else 0
            if n >= AI_BILL_DAILY:
                return 429, {"error": "daily bill-reading limit reached"}
            c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
            c.commit()
        finally:
            c.close()
    try:
        bill = bill_ai.parse_message((call or _anthropic)("POST", "/messages", bill_ai.params_for(image, AI_MODEL)))
    except urllib.error.HTTPError as e:
        if e.code == 400:
            return 422, {"error": "Claude could not open the photo"}
        raise
    if not bill:
        return 422, {"error": "Claude could not read a bill in this photo"}
    return 200, {"ok": True, "bill": bill, "checks": bill_ai.checks(bill), "model": AI_MODEL}


# ----------------------------- Returned old parts -----------------------------------------------
# Claude looks at each returned part's photo (core_ai.py), told which part it should be; the code
# flags a photo used twice and a claim the photo contradicts. Office-only; nothing is decided by it.
AI_CORE_DAYS = 30
AI_CORE_PER_CALL = 3
AI_CORE_DAILY_CALLS = int(os.environ.get("AI_CORE_DAILY_CALLS", "300"))


def core_ai_tick(call=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    with _lock:
        c = db()
        try:
            jobs = list(_store_rows(c, "jobcards").values())
            parts = _store_rows(c, "parts")
            readings = _store_rows(c, "coreai")
        finally:
            c.close()
    every = core_ai.returns_of(jobs, 0)
    first_use = {}
    for j, cr in sorted(every, key=lambda x: x[1].get("at") or 0):
        first_use.setdefault(cr["photo"], cr["id"])
    todo = []
    for j, cr in core_ai.returns_of(jobs, now_ms() - AI_CORE_DAYS * 86400000):
        old = readings.get("ca-" + cr["id"])
        if old and old.get("v") == core_ai.PROMPT_V and old.get("h") == core_ai.photo_hash(cr):
            continue
        todo.append((j, cr))
    out = {"ok": True, "checked": 0, "flagged": 0}
    for j, cr in todo[:AI_CORE_PER_CALL]:
        with _lock:
            c = db()
            try:
                key = "core:%s" % datetime.utcnow().strftime("%Y-%m-%d")
                row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
                n = int(row[0]) if row else 0
                if n >= AI_CORE_DAILY_CALLS:
                    out["limited"] = True
                    break
                c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
                c.commit()
            finally:
                c.close()
        part = parts.get(cr.get("partId") or "")
        image = gate_ai.image_block(cr["photo"])
        reading, err = None, None
        if image:
            try:
                reading = core_ai.parse_message(call("POST", "/messages", core_ai.params_for(
                    image, core_ai.describe_part(part, cr), core_ai.CLAIM.get(cr.get("condition"), "not said"), AI_MODEL)))
            except urllib.error.HTTPError as e:
                if e.code != 400:
                    raise
                err = "photo could not be opened"
            if reading is None and not err:
                continue                  # no answer through the tool: asked again next time
        else:
            err = "photo is not a link Claude can open"
        dup = first_use.get(cr["photo"]) not in (None, cr["id"])
        rec = dict(reading or {}, id="ca-" + cr["id"], cr=cr["id"], job=j.get("id"), partId=cr.get("partId") or "",
                   by=cr.get("by"), claimed=cr.get("condition") or "", dupOf=first_use.get(cr["photo"]) if dup else None,
                   flags=core_ai.flags(reading, cr.get("condition"), dup), error=err, v=core_ai.PROMPT_V,
                   h=core_ai.photo_hash(cr), model=AI_MODEL, at=now_ms())
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "coreai", rec["id"], rec, now_ms(), rev)
                c.commit()
            finally:
                c.close()
        out["checked"] += 1
        out["flagged"] += 1 if rec["flags"] else 0
    out["pending"] = max(0, len(todo) - out["checked"])
    return 200, out


# ----------------------------- Driver reports -> draft job cards --------------------------------
# Claude reads each new open driver report with the bus's recent repairs (report_ai.py) and drafts
# the job card. Office phones only; the supervisor opens the card pre-filled and decides.
AI_REPORT_DAYS = 14
AI_REPORT_PER_CALL = 3
AI_REPORT_DAILY_CALLS = int(os.environ.get("AI_REPORT_DAILY_CALLS", "300"))


def report_ai_tick(call=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    with _lock:
        c = db()
        try:
            reports = list(_store_rows(c, "driverreports").values())
            buses = _store_rows(c, "buses")
            jobs = list(_store_rows(c, "jobcards").values())
            readings = _store_rows(c, "reportai")
        finally:
            c.close()
    since = now_ms() - AI_REPORT_DAYS * 86400000
    todo = []
    for r in reports:
        if not report_ai.needs_reading(r) or (r.get("at") or 0) < since:
            continue
        old = readings.get("ra-" + r["id"])
        if old and old.get("v") == report_ai.PROMPT_V and old.get("h") == report_ai.report_hash(r):
            continue
        todo.append(r)
    todo.sort(key=lambda r: -(r.get("at") or 0))
    out = {"ok": True, "drafted": 0, "unsafe": 0}
    for r in todo[:AI_REPORT_PER_CALL]:
        with _lock:
            c = db()
            try:
                key = "report:%s" % datetime.utcnow().strftime("%Y-%m-%d")
                row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
                n = int(row[0]) if row else 0
                if n >= AI_REPORT_DAILY_CALLS:
                    out["limited"] = True
                    break
                c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
                c.commit()
            finally:
                c.close()
        bus = buses.get(r.get("busId") or "")
        image = gate_ai.image_block(r.get("photo")) if r.get("photo") else None
        params = report_ai.params_for(r, bus, report_ai.history(bus, jobs, now_ms()), image, AI_MODEL)
        try:
            draft = report_ai.parse_message(call("POST", "/messages", params))
        except urllib.error.HTTPError as e:
            if e.code != 400 or not image:
                raise
            # The photo could not be opened: draft from the words alone.
            draft = report_ai.parse_message(call("POST", "/messages", report_ai.params_for(
                r, bus, report_ai.history(bus, jobs, now_ms()), None, AI_MODEL)))
        if not draft:
            continue                      # no answer through the tool: asked again next time
        rec = dict(draft, id="ra-" + r["id"], report=r["id"], busId=r.get("busId"), v=report_ai.PROMPT_V,
                   h=report_ai.report_hash(r), model=AI_MODEL, at=now_ms())
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "reportai", rec["id"], rec, now_ms(), rev)
                c.commit()
            finally:
                c.close()
        out["drafted"] += 1
        if draft["unsafe"]:
            out["unsafe"] += 1
            try:   # the people who decide hear about an unsafe bus now, not at their next look
                send_push("Garage Saathi", "⚠️ %s: %s" % ((bus or {}).get("regNo") or "Bus", draft["title"]), "/",
                          roles=("owner", "supervisor"))
            except Exception:
                pass
    out["pending"] = max(0, len(todo) - out["drafted"])
    return 200, out


# ----------------------------- Weekly coaching notes --------------------------------------------
AI_COACH_PER_CALL = 4
AI_COACH_DAILY_CALLS = int(os.environ.get("AI_COACH_DAILY_CALLS", "400"))
COACH_DECIDERS = ("owner", "supervisor", "crewmanager")


def coach_ai_tick(call=None):
    """Draft this week's note for crew who have something in last week's facts, a few per call."""
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    week, frm, to = coach_ai.week_of(now_ms())
    with _lock:
        c = db()
        try:
            ix, ctx = _crew_review_index(c)
            crew = [d for d in _store_rows(c, "drivers").values() if (d.get("status") or "active") == "active"]
            notes = _store_rows(c, "coachai")
            incidents = list(_store_rows(c, "incidents").values())
            gps = [e for e in _store_rows(c, "gpsevents").values() if frm <= (e.get("at") or 0) < to]
            gates = list(_store_rows(c, "gatechecks").values())
            reports = list(_store_rows(c, "driverreports").values())
        finally:
            c.close()
    todo, quiet = [], 0
    for d in sorted(crew, key=lambda x: str(x.get("name") or "")):
        nid = "co-%s-%s" % (week, d["id"])
        if nid in notes:
            continue
        f = coach_ai.facts_for(d, frm, to, ix.get(d["id"]), incidents, gps, gates, reports, ctx)
        if coach_ai.has_something(f):
            todo.append((d, f, nid))
        else:
            quiet += 1
    out = {"ok": True, "week": week, "drafted": 0}
    for d, f, nid in todo[:AI_COACH_PER_CALL]:
        with _lock:
            c = db()
            try:
                key = "coach:%s" % datetime.utcnow().strftime("%Y-%m-%d")
                row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
                n = int(row[0]) if row else 0
                if n >= AI_COACH_DAILY_CALLS:
                    out["limited"] = True
                    break
                c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
                c.commit()
            finally:
                c.close()
        msg = call("POST", "/messages", coach_ai.params_for(d, f, AI_MODEL))
        note = coach_ai.parse_message(msg)
        if not note:
            # Why it could not be read (no text): asked again next time.
            out.setdefault("unread", []).append({"stop": (msg or {}).get("stop_reason"),
                                                 "blocks": [b.get("type") for b in (msg or {}).get("content") or []]})
            continue
        rec = dict(note, id=nid, week=week, crewId=d["id"], role=f["role"], facts=f, status="draft",
                   model=AI_MODEL, at=now_ms())
        with _lock:
            c = db()
            try:
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "coachai", nid, rec, now_ms(), rev)
                c.commit()
            finally:
                c.close()
        out["drafted"] += 1
    out["pending"] = max(0, len(todo) - out["drafted"])
    out["nothingToSay"] = quiet
    return 200, out


def coach_decide(actor, b):
    """Approve (as written or edited) or skip a draft. Only an approved note reaches the crew member."""
    if actor.get("role") not in COACH_DECIDERS:
        return 403, {"error": "forbidden"}
    nid, decision = str((b or {}).get("id") or ""), (b or {}).get("decision")
    if decision not in ("approve", "skip"):
        return 400, {"error": "decision must be approve or skip"}
    with _lock:
        c = db()
        try:
            note = _store_rows(c, "coachai").get(nid)
            if not note:
                return 404, {"error": "no such note"}
            if decision == "approve":
                edit = (b or {}).get("hi") or {}
                hi = {k: (str(edit.get(k)).strip()[:200] if str(edit.get(k) or "").strip() else note["hi"][k]) for k in ("good", "fix", "tip")}
                if hi != note["hi"]:
                    note["aiHi"] = note.get("aiHi") or note["hi"]     # what Claude wrote, kept
                note["hi"] = hi
            note.update(status="approved" if decision == "approve" else "skipped", decidedBy=actor["id"], decidedAt=now_ms())
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "coachai", nid, note, now_ms(), rev)
            c.commit()
        finally:
            c.close()
    return 200, {"ok": True, "status": note["status"]}


def my_coaching(user_id):
    """The crew member's own approved notes, newest first: the three lines and the week, nothing else."""
    with _lock:
        c = db()
        try:
            me = _crew_record_for(c, user_id)
            notes = list(_store_rows(c, "coachai").values()) if me else []
        finally:
            c.close()
    mine = [n for n in notes if n.get("crewId") == (me or {}).get("id") and n.get("status") == "approved"]
    mine.sort(key=lambda n: n.get("week") or "", reverse=True)
    return {"notes": [{"week": n["week"], "hi": n["hi"], "en": n.get("en"), "at": n.get("decidedAt")} for n in mine[:6]]}


# ----------------------------- The advisor, with tools ------------------------------------------
# Opus answers the owner's question by calling read-only tools over the records (advisor_ai.py),
# inside Vercel's 60 s: past AI_ADVISOR_BUDGET_S it is told to answer from what it has.
AI_ADVISOR_BUDGET_S = 30
AI_ADVISOR_TURNS = 6
_ADV_STORES = ("buses", "drivers", "jobcards", "parts", "purchases", "vendors", "incidents", "gatechecks",
               "driverreports", "fuel", "challans", "coachai", "gateai", "meta")
_ADV_RV_MEMO = {"key": None, "rows": None}


def _advisor_records(extra=()):
    """The records the advisor's tools read (advisor_ai.Records), plus any `extra` stores raw."""
    with _lock:
        c = db()
        try:
            stores = {st: _store_rows(c, st) for st in tuple(_ADV_STORES) + tuple(extra)}
            _ix, ctx = _crew_review_index(c)
            if _ADV_RV_MEMO["key"] != _CREW_RV_MEMO["key"]:
                ai = _store_rows(c, "rbreviewai")
                _ADV_RV_MEMO.update(key=_CREW_RV_MEMO["key"], rows=advisor_ai.review_rows(
                    list(_store_rows(c, "rbreviews").values()), ctx, ai, CT_day(now_ms() - 365 * 86400000)))
        finally:
            c.close()
    R = advisor_ai.Records(stores, now_ms(), _ADV_RV_MEMO["rows"] or [])
    R.raw = stores
    return R


def advise(actor, question, biz, call=None, clock=time.monotonic):
    if actor.get("role") not in ("owner", "supervisor"):
        return 403, {"error": "forbidden"}
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server"}
    call = call or (lambda m, p, b: _anthropic(m, p, b, timeout=max(10, 55 - (clock() - t0))))
    t0 = clock()
    R = _advisor_records()
    system = advisor_ai.SYSTEM.replace("{biz}", biz or "the company") + "\nToday is %s." % CT_day(now_ms())
    messages = [{"role": "user", "content": question}]
    looked = []
    for turn in range(AI_ADVISOR_TURNS):
        last = turn == AI_ADVISOR_TURNS - 1 or clock() - t0 > AI_ADVISOR_BUDGET_S
        if last and turn:
            # Out of time or turns: answer from what has been looked up (the tool definitions stay,
            # since the conversation already holds tool calls).
            messages[-1]["content"].append({"type": "text", "text": "Answer now from what you have; do not call more tools."})
        msg = call("POST", "/messages", {"model": AI_MODEL, "max_tokens": 1500, "system": system, "tools": advisor_ai.TOOLS,
                                         "tool_choice": {"type": "auto"}, "messages": messages})
        content = (msg or {}).get("content") or []
        uses = [b for b in content if b.get("type") == "tool_use"]
        text = "".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
        if not uses or last:
            return 200, {"text": text or "I could not finish looking that up in time. Ask a narrower question.", "looked": looked}
        messages.append({"role": "assistant", "content": content})
        results = []
        for b in uses:
            try:
                out = advisor_ai.run_tool(R, b.get("name"), b.get("input"))
            except Exception as e:                  # a tool bug is reported to the model, not to the user as a 500
                out = {"error": "tool failed: %s" % type(e).__name__}
            looked.append({"tool": b.get("name"), "args": {k: v for k, v in (b.get("input") or {}).items() if k != "text"}})
            results.append({"type": "tool_result", "tool_use_id": b.get("id"), "content": advisor_ai.clip(out)})
        messages.append({"role": "user", "content": results})
    return 200, {"text": "", "looked": looked}


def CT_day(ms):
    import crew_trace
    return crew_trace.day_key(ms)


# ----------------------------- The Monday summary -----------------------------------------------
DIGEST_HOUR_IST = 7                   # written from 07:00 IST on Monday, once a week


def digest_tick(force=False, biz="Mahalaxmi Travels", call=None, now=None):
    if not ANTHROPIC_API_KEY and call is None:
        return 501, {"error": "AI not configured on server (ANTHROPIC_API_KEY)"}
    call = call or _anthropic
    now = now or now_ms()
    week, frm, to = coach_ai.week_of(now)
    if not force and now < to + DIGEST_HOUR_IST * 3600000:
        return 200, {"ok": True, "week": week, "written": False, "why": "not Monday 07:00 yet"}
    R = _advisor_records(extra=("digest", "reportai", "coreai"))
    if ("dg-" + week) in R.raw["digest"] and not force:
        return 200, {"ok": True, "week": week, "written": False, "why": "already written"}
    # The 7 days before it is written: on Monday 07:00 that is last week; a mid-week "Write now" is
    # the past 7 days. (Every tool counts back from now, so the two never disagree.)
    since, to = now - 7 * 86400000, now
    R.now = now
    reports = {r.get("id"): r for r in R.reports}
    flags = {
        "unsafe_bus_reports_open": [{"bus": R.reg.get(a.get("busId")), "what": a.get("title")} for a in R.raw["reportai"].values()
                                    if a.get("unsafe") and (reports.get(a.get("report")) or {}).get("status") == "open"][:5],
        "gate_photos_doubted_last_week": sum(1 for g in R.gates if since <= (g.get("startedAt") or 0) < to and any(
            v.get("verdict") != "ok" for v in ((R.gateai.get(g.get("id")) or {}).get("items") or {}).values())),
        "old_parts_flagged_last_week": sum(1 for a in R.raw["coreai"].values() if (a.get("flags") or []) and since <= (a.get("at") or 0) < now),
        "coaching_notes_waiting_approval": sum(1 for n in R.coach if n.get("status") == "draft"),
    }
    f = digest_ai.facts(R, flags)
    d = digest_ai.parse_message(call("POST", "/messages", digest_ai.params_for(f, biz, AI_MODEL)))
    if not d:
        return 502, {"error": "Claude's summary could not be read; try again"}
    rec = dict(d, id="dg-" + week, week=week, model=AI_MODEL, at=now_ms())
    with _lock:
        c = db()
        try:
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "digest", rec["id"], rec, now_ms(), rev)
            c.commit()
        finally:
            c.close()
    try:
        send_push("Monday summary", "📰 " + d["headline"], "/", roles=("owner", "supervisor"))
    except Exception:
        pass
    return 200, {"ok": True, "week": week, "written": True, "headline": d["headline"]}


def its_lookup_diag(pnrs):
    """Owner only: look ONE PNR up and return the shape of ITS's answer (field names, messages),
    never its values, and store nothing."""
    if its_lookup is None or not its_lookup.configured():
        return 503, {"error": "ITS lookups are off"}
    p = next((str(x).strip() for x in (pnrs or []) if re.fullmatch(r"\d{5,15}", str(x).strip())), None)
    if not p:
        return 400, {"error": "expected {pnrs: [digits], diag: true}"}
    sess = None
    try:
        sess = its_lookup.Session()
        sess.diag = []
        trip = sess.lookup(p)
        return 200, {"ok": True, "found": bool(trip), "answers": sess.diag}
    except Exception as e:                # noqa: BLE001 - show how far it got
        return 200, {"ok": False, "error": str(e)[:200], "answers": getattr(sess, "diag", [])}


def may_write(role, store):
    # Checked before the owner short-circuit: these stores are written only by the
    # server from an upstream source (GPS telemetry, the eChallan proxy). A client
    # push is always forged, and "owner" is not an exemption — a stolen owner
    # session could otherwise file a clean challan record over a real liability,
    # or invent GPS history.
    if store in SERVER_INGEST_ONLY:
        return False
    if role == "owner":
        return True
    allowed = WRITE_ROLES.get(store)
    if allowed is None:
        return False            # unknown store → deny (allow-list)
    return role in allowed


def _qty(v):
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _parts_key(line):
    return (line.get("partId"), bool(line.get("reused")))


def _merge_parts_used(old_lines, new_lines):
    """Keep every part already on a job card, at the quantity it already had.

    A `partsUsed` line is a copy of a stock-ledger row: the part has physically
    left the store against this card. Nothing in the app ever takes one back
    off, so a write that is missing a line is not someone removing a part — it
    is a device that loaded the card before the part was issued. Plain
    last-write-wins would drop the line while the stock stayed down, and the
    shortfall would land in the pilferage radar as if somebody had walked out
    with it.

    Merging rather than refusing matters: that stale write usually carries real
    work (hours, photos), and refusing it would lose that instead."""
    merged = []
    seen = {}
    for line in new_lines or []:
        if not isinstance(line, dict):
            continue
        copy = dict(line)
        merged.append(copy)
        seen.setdefault(_parts_key(line), copy)
    for line in old_lines or []:
        if not isinstance(line, dict):
            continue
        key = _parts_key(line)
        kept = seen.get(key)
        if kept is None:
            copy = dict(line)
            merged.append(copy)
            seen[key] = copy
        elif _qty(line.get("qty")) > _qty(kept.get("qty")):
            kept["qty"] = line.get("qty")
            kept["cost"] = line.get("cost")
    return merged


def _log_stock_moves(c, moves, ledger_rows, actor, rev):
    """Append an immutable record of each quantity change in one push.

    The store role can legitimately edit `parts`, so this is not about refusing
    the write — it is about making sure it cannot happen quietly. A change is
    `justified` only when the ledger rows this push actually STORED for that part
    account for it exactly: stock in minus stock out equals the change in the
    count. It used to be enough that any ledger record for the part appeared in
    the request — one that was refused or never saved counted, and a one-unit
    issue excused a ten-unit drop.

    Each row gets a random id. The id was part + millisecond, so two moves of one
    part in the same millisecond overwrote each other and the larger one vanished.
    """
    net = {}
    for l in ledger_rows:
        pid = l.get("partId")
        q = _qty(l.get("qty"))
        net[pid] = net.get(pid, 0.0) + (q if l.get("type") == "in" else -q if l.get("type") == "out" else 0.0)
    total = {}
    for pid, was, now_q in moves:
        total[pid] = total.get(pid, 0.0) + (now_q - was)
    for pid, was, now_q in moves:
        justified = pid in net and abs(net[pid] - total[pid]) < 1e-9
        mid = "sm-" + uuid.uuid4().hex
        rev = _upsert_record(c, "stockmoves", mid, {
            "id": mid, "partId": pid,
            "was": was, "now": now_q, "delta": now_q - was,
            "by": actor["id"], "byRole": actor["role"],
            "justified": justified, "at": now_ms(),
        }, now_ms(), rev)
    return rev


def _sync_disabled_login(c, crew):
    """Keep a crew member's login in step with their crew-bank record.

    Marking someone left or archived only changed the crew record, so the person
    kept a working PIN and full sync access. A login whose crew record is left,
    archived or deleted is now refused; setting them active again restores it."""
    uid = crew.get("userId")
    if not uid:
        return
    if crew.get("_deleted") or crew.get("status") in ("left", "archived"):
        c.execute("INSERT INTO disabledlogins(id,at) VALUES(?,?) "
                  "ON CONFLICT(id) DO UPDATE SET at=excluded.at", (uid, now_ms()))
    else:
        c.execute("DELETE FROM disabledlogins WHERE id=?", (uid,))


def rebuild_disabled_logins():
    """Derive the disabled list from every crew record, once per process, so crew
    who left before this rule existed are covered too.

    Written as a diff against the table, not one statement per crew member: the
    database is a network hop away, and a statement per driver on every cold start
    added tens of seconds before the first login could be answered. Normally this
    is two reads and no writes."""
    with _lock:
        c = db()
        want, keep = set(), set()
        for raw, in c.execute("SELECT data FROM records WHERE store='drivers'").fetchall():
            try:
                d = json.loads(raw)
            except Exception:
                continue
            if not isinstance(d, dict) or not d.get("userId"):
                continue
            if d.get("_deleted") or d.get("status") in ("left", "archived"):
                want.add(d["userId"])
            else:
                keep.add(d["userId"])
        # A login linked to any live crew record stays on (a rehire's new record).
        want -= keep
        have = {r[0] for r in c.execute("SELECT id FROM disabledlogins").fetchall()}
        now = now_ms()
        for uid in want - have:
            c.execute("INSERT INTO disabledlogins(id,at) VALUES(?,?) ON CONFLICT(id) DO NOTHING", (uid, now))
        for uid in (have - want) & keep:
            c.execute("DELETE FROM disabledlogins WHERE id=?", (uid,))
        c.commit()
        c.close()


def login_disabled(user_id):
    c = db()
    row = c.execute("SELECT 1 FROM disabledlogins WHERE id=?", (user_id,)).fetchone()
    c.close()
    return bool(row)


_UNSAFE_ID = re.compile(r"[<>\"'`&\x00-\x1f]")


def push(records, actor=None):
    """Apply pushed records. When `actor` (the authenticated user) is given, enforce
    the write matrix and stamp immutable server-truth provenance (_by/_byRole/_org)
    that the client cannot set — so attribution and tenant scope come from the token,
    not the request body. Returns applied + rejected counts, and `refused`: one {store,id,reason} per
    record that was turned away. The counts alone were only ever enough because
    the client pushed a single record per request and could infer which one it
    was. Naming them lets it push the whole batch in one request and still
    quarantine exactly the record the server objected to."""
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        applied = 0
        rejected = 0
        refused = []
        moves = []            # (partId, was, now) — logged once the batch is known
        applied_ledger = []   # ledger rows this push actually stored
        gate_alerts = []      # gate checks that just went to the office
        for r in records:
            store, rid = r.get("store"), r.get("id")
            upd = int(r.get("updatedAt") or 0)
            if not store or not rid:
                continue
            if actor and not may_write(actor["role"], store):
                rejected += 1
                refused.append({"store": store, "id": rid, "reason": "role may not write this store"})
                continue
            data = r.get("data")
            # The record must be an object whose own key is the id that was just
            # authorised. Every device stores a pulled record under its data.id,
            # so an envelope for a fresh id carrying data.id of an existing row
            # let a store or driver login overwrite that row everywhere — past
            # the append-only ledger rule, which only saw the fresh id. And
            # non-object data skipped every rule in _guard_write, then stalled
            # the pull cursor on each device that could not store it.
            if actor:
                why = None
                # Ids end up inside HTML attributes on every device; a quote or
                # angle bracket in one is markup, not a name.
                if not isinstance(rid, str) or len(rid) > 200 or _UNSAFE_ID.search(rid):
                    why = "record id has characters that are not allowed"
                elif not isinstance(data, dict):
                    why = "record data must be an object"
                else:
                    kp = "key" if store == "meta" else "rc" if store == "challans" else "id"
                    if kp not in data:
                        data[kp] = rid
                    elif str(data[kp]) != str(rid):
                        why = "record id does not match its data"
                    elif data.get("_redacted"):
                        why = "record is a redacted copy"
                if why:
                    rejected += 1
                    refused.append({"store": store, "id": rid, "reason": why})
                    continue
            # Overwrite reserved provenance fields from the TOKEN (never trust the
            # body). _by is the trust anchor the Pilferage Radar / audits read.
            if actor and isinstance(data, dict):
                data["_by"] = actor["id"]
                data["_byRole"] = actor["role"]
                data["_org"] = "mahalaxmi"
            # Clamp, do not reject: phone clocks drift, and refusing the write
            # would lose real work. But a date beyond the skew window would make
            # the record permanent under last-write-wins.
            if upd > now_ms() + MAX_FUTURE_SKEW_MS:
                upd = now_ms()
            # Devices order records by data.updatedAt, not the envelope. Clamping
            # only the envelope let a far-future payload make every device ignore
            # the owner's later correction.
            if isinstance(data, dict):
                data["updatedAt"] = upd
            row = c.execute("SELECT updatedAt,data FROM records WHERE store=? AND id=?",
                            (store, rid)).fetchone()
            existing = None
            if row is not None:
                try:
                    existing = json.loads(row[1])
                except Exception:
                    existing = None
            if actor and isinstance(data, dict):
                # Who first wrote the record survives every later edit; _by is
                # only the last writer.
                if existing and existing.get("_createdBy"):
                    data["_createdBy"] = existing["_createdBy"]
                    data["_createdRole"] = existing.get("_createdRole")
                elif not existing:
                    data["_createdBy"] = actor["id"]
                    data["_createdRole"] = actor["role"]
                else:
                    data.pop("_createdBy", None)
                    data.pop("_createdRole", None)
            if actor:
                before_guard = json.dumps(data, sort_keys=True)
                reason = _guard_write(store, rid, data, actor, existing, c)
                if reason:
                    rejected += 1
                    refused.append({"store": store, "id": rid, "reason": reason})
                    print("push refused: %s/%s by %s — %s" % (store, rid, actor["id"], reason))
                    continue
                # _guard_write does not only accept or refuse: it CORRECTS. It
                # merges back a parts line a stale device dropped, marks an
                # attendance time unverified, carries a job's crew over. The
                # device that pushed decides whether a pulled record is newer by
                # data.updatedAt, which was stamped above and therefore equals
                # what it already holds — so the correction was pulled by every
                # OTHER phone and never by the one that needed it, which went on
                # showing the job card without the part. A changed payload gets
                # a later timestamp so its author sees it too.
                if json.dumps(data, sort_keys=True) != before_guard:
                    upd = max(upd + 1, now_ms())
                    data["updatedAt"] = upd
            if row is None or upd > (row[0] or 0):
                # A part's quantity is money. Record every change of it in a store
                # no client can write or delete, with who did it and whether a
                # ledger row justified it — so "correcting" the book to match an
                # emptier shelf stops being invisible.
                if store == "parts" and actor and isinstance(data, dict) and existing is not None:
                    # A missing qty counts as zero. Skipping it let a count go
                    # 10 -> nothing -> 3 with no move logged at all. (A part the
                    # server has never seen is not a move: the bundle's parts are
                    # only pushed the first time someone edits one.)
                    was, now_q = _qty(existing.get("qty")), _qty(data.get("qty"))
                    if was != now_q:
                        moves.append((rid, was, now_q))
                if store == "ledger" and actor and isinstance(data, dict) and not data.get("_deleted"):
                    applied_ledger.append(data)
                if store == "drivers" and isinstance(data, dict):
                    _sync_disabled_login(c, data)
                if (store == "gatechecks" and isinstance(data, dict) and data.get("status") == "awaiting"
                        and (existing or {}).get("status") != "awaiting"):
                    gate_alerts.append(data)
                rev = _upsert_record(c, store, rid, data, upd, rev)
                applied += 1
        if moves:
            rev = _log_stock_moves(c, moves, applied_ledger, actor, rev)
        c.commit()
        c.close()
    # After the lock is released: a push notification is a network call.
    for g in gate_alerts:
        _gate_alert(g)
    return {"ok": True, "applied": applied, "rejected": rejected,
            "refused": refused, "maxRev": rev}


# Contact and document fields that used to ship in the public seed bundle and now
# reach devices only through a signed-in sync.
BACKFILL_FIELDS = {"drivers": ("phone", "altPhone"), "buses": ("crewPhone", "docsFolderId")}


def backfill_contacts(records, actor):
    """Give the server the crew phones and Drive folder links that used to live
    only in the public seed bundle.

    Bundle rows were loaded on each device without ever being pushed, so the
    server may hold no copy of a bus or driver, or a copy without these fields.
    A manager's device sends what it has. Nothing is overwritten: a record the
    server lacks is added with a low timestamp, so any real edit elsewhere still
    wins, and a record it has only gains fields that are empty on the server."""
    added = merged = 0
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        for r in records or []:
            store, rid, data = r.get("store"), r.get("id"), r.get("data")
            fields = BACKFILL_FIELDS.get(store)
            if (not fields or not isinstance(rid, str) or _UNSAFE_ID.search(rid)
                    or not isinstance(data, dict) or str(data.get("id")) != rid
                    or data.get("_deleted") or data.get("_redacted")):
                continue
            row = c.execute("SELECT updatedAt,data FROM records WHERE store=? AND id=?",
                            (store, rid)).fetchone()
            if row is None:
                d = dict(data, _by=actor["id"], _byRole=actor["role"], _org="mahalaxmi")
                rev = _upsert_record(c, store, rid, d, int(data.get("updatedAt") or 1), rev)
                added += 1
                continue
            try:
                cur = json.loads(row[1])
            except Exception:
                continue
            if not isinstance(cur, dict) or cur.get("_deleted"):
                continue
            gain = {k: data[k] for k in fields if data.get(k) and not cur.get(k)}
            if gain:
                cur.update(gain)
                upd = int(row[0] or 0) + 1
                cur["updatedAt"] = max(int(cur.get("updatedAt") or 0), upd)
                rev = _upsert_record(c, store, rid, cur, upd, rev)
                merged += 1
        c.commit()
        c.close()
    return {"ok": True, "added": added, "merged": merged}


def register_roster(crew=None, pins_out=None):
    """Materialize server login accounts for every crew (driver/conductor) who has
    none yet, so they can server-authenticate and their writes carry a real,
    attributable identity.

    Each new account gets its OWN random PIN. They used to share one, and the ids
    are public at /roster, so anyone could sign in as any crew member who had not
    changed it. Accounts still on that old shared PIN are given a fresh one here
    too. Every PIN set is written into `pins_out` ({id: pin}) — the only time it
    exists in the clear — so the manager who pressed the button can hand them out.

    The roster is normally SENT by the owner device (`crew` = list of {id,name,role}),
    because the bundled seed loads crew with notify=false and never pushes them — so
    the server has no crew records to scan. When `crew` is omitted we fall back to
    any store='users' records that WERE pushed. Only driver/conductor roles are ever
    created (management accounts keep their real PINs). Idempotent: an existing
    account is never touched; tombstones are skipped."""
    with _lock:
        c = db()
        # Never resurrect an account that was deliberately deleted.
        #
        # /auth/users/delete tombstones the synced roster row, but a device that
        # has not pulled that tombstone yet still lists the person — and the crew
        # list is SENT by the device. Pressing "Activate crew server logins" on a
        # stale phone therefore re-created every account the owner had just
        # removed: 57 conductor logins deleted, all 57 back minutes later, from
        # one device that had not caught up. The tombstone here is the authority,
        # not whatever a client sent.
        dead = set()
        for rid, data in c.execute("SELECT id,data FROM records WHERE store='users'").fetchall():
            try:
                if json.loads(data).get("_deleted"):
                    dead.add(rid)
            except Exception:
                continue
        if crew:
            items = [(x.get("id"), x.get("name"), x.get("role")) for x in crew
                     if isinstance(x, dict) and x.get("role") in ("driver", "conductor") and x.get("id")]
        else:
            items = []
            for rid, data in c.execute("SELECT id,data FROM records WHERE store='users'").fetchall():
                try:
                    d = json.loads(data)
                except Exception:
                    continue
                if d.get("_deleted") or d.get("role") not in ("driver", "conductor"):
                    continue
                items.append((rid, d.get("name"), d.get("role")))
        created = 0
        skipped = 0
        for rid, name, role in items:
            if not rid:
                continue
            if rid in dead:
                skipped += 1
                continue
            if c.execute("SELECT 1 FROM users WHERE id=?", (rid,)).fetchone():
                continue
            pin = random_pin()
            salt = uuid.uuid4().hex
            c.execute("INSERT INTO users(id,name,role,salt,pin_hash) VALUES(?,?,?,?,?)",
                      (rid, name or rid, role, salt, hash_pin(salt, pin)))
            if pins_out is not None:
                pins_out[rid] = pin
            created += 1
        # Existing crew still on the old shared PIN. Login refuses it, so until
        # this runs they cannot sign in; after it, each has a PIN of their own.
        for rid, role, salt, ph in c.execute(
                "SELECT id,role,salt,pin_hash FROM users WHERE role IN ('driver','conductor')").fetchall():
            if hash_pin(salt, CREW_DEFAULT_PIN) != ph:
                continue
            pin = random_pin()
            nsalt = uuid.uuid4().hex
            c.execute("UPDATE users SET salt=?, pin_hash=? WHERE id=?", (nsalt, hash_pin(nsalt, pin), rid))
            if pins_out is not None:
                pins_out[rid] = pin
        c.commit()
        c.close()
    if skipped:
        print("register_roster: ignored %d deleted account(s) a client asked to re-create" % skipped)
    return created


PULL_LIMIT = int(os.environ.get("PULL_LIMIT", "600"))


# Who may see crew contact details, identity documents and pay. Everyone else still
# syncs every store — the screens depend on it — but gets those fields removed
# from other people's records before they leave the server.
PII_ROLES = ("owner", "supervisor", "crewmanager")
_DRIVER_PRIVATE = ("phone", "altPhone", "address", "dob", "bloodGroup", "license",
                   "docs", "salaryMonthly")


# Live-GPS history. Every screen that reads it looks back 7 days at most (the
# safety screen, the insight cards, a bus's recent events) and only owner and
# supervisor can open any of them — but the table had grown past 42,000 rows and
# /pull handed every one to every device. A phone re-downloading the fleet spent
# its evening on telemetry nobody would ever look at, which is most of what
# "it keeps loading" was.
GPS_HISTORY_ROLES = ("owner", "supervisor")
GPS_HISTORY_MS = int(os.environ.get("GPS_HISTORY_DAYS", "30")) * 86400000

# How much history a phone actually needs, per store.
#
# These are append-only trails — telemetry, stop arrivals, seat changes, stock
# moves, counts, usage. They grow for ever (gpsevents reached 42,000 rows and
# triplog adds stops x buses x days, roughly 55,000 a year), every device
# downloaded all of it, and load() re-reads the lot on every sync tick. The
# windows are set from what the screens actually look back over, with room to
# spare: learned stop times use 21 days, unexplained stock moves 90, the usage
# dashboard 30. A record older than its window is simply not sent.
HISTORY_DAYS = {
    "gpsevents":  int(os.environ.get("GPS_HISTORY_DAYS", "30")),
    "triplog":    int(os.environ.get("TRIPLOG_HISTORY_DAYS", "120")),
    "stockmoves": int(os.environ.get("STOCKMOVES_HISTORY_DAYS", "180")),
    "usage":      int(os.environ.get("USAGE_HISTORY_DAYS", "90")),
    "audits":     int(os.environ.get("AUDITS_HISTORY_DAYS", "365")),
    "dutylog":    int(os.environ.get("DUTYLOG_HISTORY_DAYS", "365")),
}
# And who has a screen for it at all. A driver's phone was downloading the
# complete stock-movement ledger of the garage.
HISTORY_ROLES = {
    "gpsevents":  GPS_HISTORY_ROLES,
    "stockmoves": ("owner", "supervisor", "store"),
    "usage":      ("owner", "supervisor"),
    "audits":     ("owner", "supervisor", "store"),
}


def _record_at(d):
    """When a record happened. `at` on the trails, `lastAt` on a usage row, and
    `updatedAt` for anything else — every record carries that one."""
    if not isinstance(d, dict):
        return 0
    for f in ("at", "lastAt", "updatedAt"):
        v = d.get(f)
        if isinstance(v, (int, float)) and v > 0:
            return int(v)
    return 0


def redact_for(actor, rec):
    """The copy of a record this actor is allowed to receive, or None to omit it.

    /pull used to hand every authenticated role the whole table, so a conductor's
    login could download every colleague's Aadhaar and licence numbers, document
    photos, phone numbers and salary. The client hid them; the server did not."""
    st, d = rec["store"], rec["data"]
    # Checked before the PII_ROLES shortcut: this is about volume, and it
    # applies to the owner's phone as much as anyone's. Omitted records still
    # count as sent — pull() takes its cursor before redaction — so the client
    # does not ask for them again.
    if st == "aimeta":                    # server bookkeeping (the open review batch), for no phone
        return None
    if st == "digest" and (actor or {}).get("role") not in ("owner", "supervisor"):
        return None                       # the Monday summary carries money: owner and supervisor only
    if st == "crewnotes" and (actor or {}).get("role") not in ("owner", "supervisor", "crewmanager", "office"):
        # A note written knowing its subject will read it stops being a record
        # and becomes a performance. The crew member has /my/coaching for what
        # they are meant to see — approved, constructive, and written for them.
        return None
    if st in HISTORY_DAYS:
        roles = HISTORY_ROLES.get(st)
        if roles and (actor or {}).get("role") not in roles:
            return None
        if _record_at(d) < now_ms() - HISTORY_DAYS[st] * 86400000:
            return None
        return rec
    if not actor or actor.get("role") in PII_ROLES:
        return rec
    if not isinstance(d, dict):
        return rec
    if st == "waconv":                    # keyed by a crew member's phone number
        return None
    if st in ("rbreviews", "rbcomplaints", "rbassign", "itslookup", "rbreviewai", "rbaliasai", "gateai", "coreai", "reportai", "coachai"):
        # Reviews, complaints and redBus's driver names are for the people who act
        # on them. A driver's phone does not need every passenger's comment about
        # every colleague. (rbservices holds no names: drivers need it to pick the
        # service on the gate check.)
        return None
    if st == "drivers" and d.get("userId") != actor.get("id"):
        drop = _DRIVER_PRIVATE
    elif st == "buses":
        drop = ("crewPhone",)
    elif st == "odometerlogs":
        drop = ("phone",)
    else:
        return rec
    if not any(k in d for k in drop):
        return rec
    # Marked, so the device knows this copy is partial: it is never pushed back,
    # and a full copy replaces it if a manager later signs in on that device.
    d = dict({k: v for k, v in d.items() if k not in drop}, _redacted=True)
    return dict(rec, data=d)


def pull(since, limit=None, actor=None):
    """One page of records newer than `since`, oldest rev first.

    This used to return the whole table. On a serverless host that meant a first
    sync — 2,900 records read from Postgres in another region and serialised in
    one response — ran past the function timeout and returned 504. The client
    only stores its cursor after a SUCCESSFUL pull, so every retry started from
    zero and hit the same wall: a brand-new device could never finish syncing,
    and every phone being handed out is a brand-new device.

    Paging is by rev, and a page never splits a rev group. push() gives every
    record in one batch the same rev, so cutting mid-group would let the client
    advance its cursor past records it never received.
    """
    limit = limit or PULL_LIMIT
    with _lock:
        c = db()
        rows = c.execute(
            "SELECT store,id,data,updatedAt,rev FROM records WHERE rev>? ORDER BY rev ASC LIMIT ?",
            (since, limit)).fetchall()
        maxrev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        if rows and len(rows) == limit:
            last = rows[-1][4]
            # Drop the trailing partial rev group unless it is the whole page, in
            # which case take the rest of that group so progress is still made.
            trimmed = [r for r in rows if r[4] < last]
            if trimmed:
                rows = trimmed
            else:
                # LIMIT must precede OFFSET for SQLite; a bare OFFSET is Postgres-only.
                rows += c.execute(
                    "SELECT store,id,data,updatedAt,rev FROM records WHERE rev=? "
                    "ORDER BY id ASC LIMIT ? OFFSET ?", (last, 1000000, len(rows))).fetchall()
        c.close()
    recs = [{"store": st, "id": i, "data": json.loads(d), "updatedAt": u, "rev": rv}
            for (st, i, d, u, rv) in rows]
    # maxRev is the cursor the client stores: the last rev actually SENT, not the
    # table maximum, or it would skip everything this page left behind.
    cursor = recs[-1]["rev"] if recs else maxrev
    # Redact AFTER the cursor is taken: an omitted record must still count as
    # sent, or the client would ask for the same page forever.
    recs = [x for x in (redact_for(actor, r) for r in recs) if x is not None]
    return {"records": recs, "maxRev": cursor, "more": cursor < maxrev, "tableMax": maxrev,
            "serverTime": now_ms()}


# ----------------------------- GPS simulator -------------------------------
# Stands in for the bus tracker's API. The client adapter (GpsProvider in app.js)
# calls GET /gps?busId=..&odo=.. ; swap this for the real provider in production.
GPS_STATE = {}                 # busId -> {t0, odo0}   (simulator fallback)
LIVE_GPS = {}                  # normalised reg -> latest real telemetry from provider
JAIPUR = (26.9124, 75.7873)

# Dedicated token the GPS provider (AirFi) uses for /gps/ingest. Sourced from the
# GPS_INGEST_TOKEN env var, falling back to the git-ignored .gps_ingest_token file.
# No insecure default: if it's unset (or still a demo placeholder), /gps/ingest is
# refused so nobody can push fake telemetry.
def _read_gps_token():
    t = os.environ.get("GPS_INGEST_TOKEN", "").strip()
    if t:
        return t
    # Fallbacks: a Render Secret File, or the local git-ignored file.
    for p in (os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gps_ingest_token"),
              "/etc/secrets/GPS_INGEST_TOKEN", "/etc/secrets/.gps_ingest_token"):
        try:
            with open(p) as f:
                v = f.read().strip()
                if v:
                    return v
        except Exception:
            pass
    return ""
GPS_INGEST_TOKEN = _read_gps_token()
_GPS_TOKEN_OK = bool(GPS_INGEST_TOKEN) and "demo" not in GPS_INGEST_TOKEN.lower() and "change-me" not in GPS_INGEST_TOKEN.lower()


_REG_RX = re.compile(r"^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$")


def norm_reg(s):
    """The one key a registration is matched on, however it was written.

    Stripping spaces and dashes was not enough. The official plate pads the
    trailing number to four digits and the district to two — MP44ZD0471 — and
    that is exactly what AirFi's trackers send, while the office's fleet list
    dropped the zero on 15 buses (MP44ZD471). The two never matched: the ping
    was stored, and the bus it belonged to showed nothing.

    Padding is applied only when a series letter separates district from
    number. Without one (RJ14123) the boundary is genuinely ambiguous, and
    guessing wrong would merge two real vehicles — so those are left as written.
    Bare fleet numbers like "1217" do not match at all and pass through."""
    n = (s or "").upper().replace(" ", "").replace("-", "")
    m = _REG_RX.match(n)
    if not m:
        return n
    state, district, series, number = m.groups()
    return state + district.zfill(2) + series + number.zfill(4)


def iso_ms(s):
    try:
        return int(datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return int(time.time() * 1000)


def _ist_hour(ms):
    return int(((ms / 1000 + 5.5 * 3600) % 86400) // 3600)

def _gps_load_row(reg, data):
    """Load one persisted position into LIVE_GPS under today's match key.

    Rows written before norm_reg() padded registrations are keyed the old way.
    Re-keying on load means nothing already stored is stranded under a key
    nobody looks up any more; where both spellings exist, the newer ping wins."""
    try:
        rec = json.loads(data)
    except Exception:
        return
    key = norm_reg(reg)
    have = LIVE_GPS.get(key)
    if have is None or (rec.get("lastPing") or 0) >= (have.get("lastPing") or 0):
        LIVE_GPS[key] = rec


def _gps_hydrate():
    """Serverless-safe refresh: reload the latest positions from the persisted
    `gpslive` store into LIVE_GPS. On a single long-lived process this is a no-op
    after startup, but on serverless (Vercel) each request may hit a fresh
    container whose in-memory LIVE_GPS is empty — so ingest's delta calc and the
    /gps read endpoints must re-read the source of truth (Turso) every request."""
    try:
        c = db()
        rows = c.execute("SELECT reg,data FROM gpslive").fetchall()
        c.close()
        for reg, data in rows:
            _gps_load_row(reg, data)
    except Exception:
        pass


def ingest_gps(events):
    _gps_hydrate()           # see prior sample for overspeed/harshbrake/idle deltas
    accepted = 0
    new_events = []          # safety/misuse events detected this batch
    for e in events or []:
        reg = norm_reg(e.get("vehicleReg") or e.get("deviceId"))
        if not reg:
            continue
        spd = float(e.get("speedKph") or 0)
        ign = bool(e.get("ignition"))
        ts = iso_ms(e.get("timestamp"))
        lat, lng = e.get("lat"), e.get("lng")
        disp = (e.get("vehicleReg") or e.get("deviceId") or "").strip()
        p = LIVE_GPS.get(reg) or {}
        night = _ist_hour(ts) >= NIGHT_START_IST or _ist_hour(ts) < NIGHT_END_IST

        def mkev(t, v):
            new_events.append({"id": "ev-" + uuid.uuid4().hex[:10], "reg": disp or reg, "type": t,
                               "value": round(float(v), 1), "lat": lat, "lng": lng, "at": ts})
        # Overspeed — only on the transition into overspeed (one event per episode).
        if spd >= OVERSPEED_KPH and p.get("speedKph", 0) < OVERSPEED_KPH:
            mkev("overspeed", spd)
        # Harsh braking — large speed drop in a single interval.
        if p and (p.get("speedKph", 0) - spd) >= HARSH_DROP_KPH and spd < p.get("speedKph", 0):
            mkev("harshbrake", p.get("speedKph", 0) - spd)
        # Night movement — moving during the night window (debounced to 30 min).
        last_night = p.get("_lastNight", 0)
        if ign and spd > 5 and night and (ts - last_night) > 30 * 60 * 1000:
            mkev("night", spd); last_night = ts
        # Long idle — engine on, not moving, ≥ IDLE_MIN (one event per episode).
        idle_start, idle_logged = p.get("_idleStart"), p.get("_idleLogged", False)
        if ign and spd < 2:
            if not idle_start:
                idle_start = ts
            if not idle_logged and (ts - idle_start) >= IDLE_MIN * 60 * 1000:
                mkev("idle", (ts - idle_start) / 60000.0); idle_logged = True
        else:
            idle_start, idle_logged = None, False

        LIVE_GPS[reg] = {
            "lat": lat, "lng": lng, "speedKph": spd, "ignition": ign,
            "odometer": int(float(e.get("odometerKm") or 0)), "lastPing": ts,
            "deviceId": e.get("deviceId"), "reg": disp,
            "_idleStart": idle_start, "_idleLogged": idle_logged, "_lastNight": last_night,
        }
        accepted += 1
    if new_events:
        with _lock:
            c = db()
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            now = now_ms()
            for ev in new_events:
                rev = _upsert_record(c, "gpsevents", ev["id"], ev, now, rev)
            c.commit(); c.close()
        # Push the most urgent misuse signal (night movement) to owners/supervisors.
        for ev in new_events:
            if ev["type"] == "night":
                send_push("🌙 Night movement", f"{ev['reg']} is moving at night — confirm it's an authorised trip.", "/")
    # Persist latest positions so the live map survives a server restart/spin-down.
    if accepted:
        try:
            with _lock:
                c = db(); now2 = now_ms()
                for e in events or []:
                    reg = norm_reg(e.get("vehicleReg") or e.get("deviceId"))
                    if reg and reg in LIVE_GPS:
                        c.execute("INSERT INTO gpslive(reg,data,at) VALUES(?,?,?) ON CONFLICT(reg) "
                                  "DO UPDATE SET data=excluded.data, at=excluded.at",
                                  (reg, json.dumps(LIVE_GPS[reg]), now2))
                c.commit(); c.close()
        except Exception:
            pass
    return {"ok": True, "accepted": accepted, "events": len(new_events)}


def _load_live_gps():
    """Repopulate LIVE_GPS from the persisted store at startup, so a fresh process
    (Render cold start) still shows last-known positions before AirFi pushes again."""
    try:
        c = db()
        rows = c.execute("SELECT reg,data FROM gpslive").fetchall()
        c.close()
        for reg, data in rows:
            _gps_load_row(reg, data)
        if LIVE_GPS:
            print(f"Loaded {len(LIVE_GPS)} live GPS position(s) from store")
    except Exception as e:
        print("gpslive load skipped:", e)


# The push services browsers actually use. The server POSTs to whatever endpoint
# a subscription names, so an unchecked one let any login aim the server at an
# internal address and read, from the delivery count, whether it answered.
_PUSH_HOSTS = re.compile(r"^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com"
                         r"|[a-z0-9.-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com"
                         r"|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$")


def valid_push_endpoint(ep):
    try:
        u = urllib.parse.urlparse(ep)
    except Exception:
        return False
    return (u.scheme == "https" and not u.username and not u.password and u.port in (None, 443)
            and bool(_PUSH_HOSTS.match((u.hostname or "").lower())))


def save_pushsub(sub, role):
    ep = sub.get("endpoint") if isinstance(sub, dict) else None
    if not ep or not valid_push_endpoint(ep):
        return False
    with _lock:
        c = db()
        c.execute("INSERT INTO pushsubs(endpoint,sub,role,at) VALUES(?,?,?,?) "
                  "ON CONFLICT(endpoint) DO UPDATE SET sub=excluded.sub, role=excluded.role, at=excluded.at",
                  (ep, json.dumps(sub), role or "owner", now_ms()))
        c.commit(); c.close()
    return True


def _del_pushsub(ep):
    with _lock:
        c = db(); c.execute("DELETE FROM pushsubs WHERE endpoint=?", (ep,)); c.commit(); c.close()


def _gate_alert(check):
    """A bus is waiting at the gate with a failed item: tell the office now.
    Never raises — a failed notification must not fail the driver's push."""
    try:
        failed = ", ".join(_gate_failed(check.get("items"))) or "an item"
        send_push("⛔ %s waiting at the gate" % (check.get("regNo") or "A bus"),
                  "%s: %s failed. Approve or hold." % (check.get("driverName") or "Driver", failed),
                  "/")
    except Exception as e:
        print("gate alert failed:", e)


def send_push(title, body, url="/", roles=("owner", "supervisor")):
    """Send a web-push to stored subscriptions. roles=None → everyone."""
    if not _WEBPUSH:
        return 0
    pem = _vapid_pem_path()
    if not pem:
        return 0
    with _lock:
        c = db()
        rows = c.execute("SELECT endpoint,sub,role FROM pushsubs").fetchall()
        c.close()
    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    for ep, sub_json, role in rows:
        if roles and role not in roles:
            continue
        if not valid_push_endpoint(ep):          # stored before endpoints were checked
            _del_pushsub(ep)
            continue
        try:
            webpush(subscription_info=json.loads(sub_json), data=payload,
                    vapid_private_key=pem, vapid_claims={"sub": VAPID_SUBJECT}, timeout=10)
            sent += 1
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):      # gone/expired → drop the dead subscription
                _del_pushsub(ep)
        except Exception:
            pass
    return sent


def gps_telemetry(bus_id, odo, reg=None):
    # Prefer REAL provider data once AirFi is pushing it for this registration.
    live = LIVE_GPS.get(norm_reg(reg))
    if live:
        return {"busId": bus_id, "source": "provider", **live}
    # Otherwise fall back to the local simulator so the app is demo-able offline.
    t = time.time()
    with _lock:
        st = GPS_STATE.get(bus_id)
        if not st:
            st = {"t0": t, "odo0": float(odo or 0)}
            GPS_STATE[bus_id] = st
    elapsed = t - st["t0"]
    phase = (int(hashlib.sha256(bus_id.encode()).hexdigest(), 16) % 360) * math.pi / 180
    speed = max(0.0, 46 * math.sin(elapsed / 40.0 + phase))          # km/h, 0 = parked
    odometer = int(st["odo0"] + (elapsed / 3600.0) * 230)
    lat = JAIPUR[0] + 0.02 * math.sin(elapsed / 120.0 + phase)
    lng = JAIPUR[1] + 0.02 * math.cos(elapsed / 120.0 + phase)
    return {"busId": bus_id, "source": "simulated", "lat": round(lat, 5), "lng": round(lng, 5),
            "speedKph": round(speed, 1), "ignition": speed > 1,
            "odometer": odometer, "lastPing": int(t * 1000)}


# The AI advisor is an owner/supervisor screen, and every call is billed to the
# operator's key. Any login could use it as a general proxy, with any model.
# Opus by the owner's decision (18 Oct 2026): every AI call in the app uses it. AI_MODEL overrides.
AI_MODEL = os.environ.get("AI_MODEL", "").strip() or "claude-opus-5-5"
AI_DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "60"))


def ai_allowed(user):
    """None if this user may make one more AI call today (and counts it), else why not."""
    if user.get("role") not in ("owner", "supervisor"):
        return "forbidden"
    key = "%s:%s" % (user["id"], datetime.utcnow().strftime("%Y-%m-%d"))
    with _lock:
        c = db()
        row = c.execute("SELECT n FROM aiusage WHERE k=?", (key,)).fetchone()
        n = int(row[0]) if row else 0
        if n >= AI_DAILY_LIMIT:
            c.close()
            return "daily AI limit reached"
        c.execute("INSERT INTO aiusage(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1))
        c.commit()
        c.close()
    return None


def _rate_ok(user_id, bucket):
    """(True, 0) when this request may proceed, else (False, seconds to wait).

    FAILS OPEN, deliberately. A limiter that refuses work because its own
    counter table hiccuped would turn a database blip into a yard that cannot
    release a bus — which is a worse outage than the cost it exists to cap. If
    the check cannot run, the request goes through and the reason is logged.

    One extra round-trip per sync request is the price. At a tick every four
    seconds per device that is cheap next to an unbounded retry loop.
    """
    if RATE_LIMIT_OFF or not user_id:
        return True, 0
    cap, window = (RL_SYNC_PER_MIN, 60) if bucket == "sync" else (RL_UPLOAD_PER_HOUR, 3600)
    if cap <= 0:
        return True, 0
    now = int(time.time())
    win = now // window
    key = "%s:%s:%d" % (bucket, user_id, win)
    try:
        with _lock:
            c = db()
            row = c.execute("SELECT n FROM ratelimit WHERE k=?", (key,)).fetchone()
            n = int(row[0]) if row else 0
            if n >= cap:
                c.close()
                return False, max(1, (win + 1) * window - now)
            c.execute("INSERT INTO ratelimit(k,n,win) VALUES(?,?,?) "
                      "ON CONFLICT(k) DO UPDATE SET n=excluded.n", (key, n + 1, win))
            # Sweep spent windows occasionally instead of on a schedule nobody
            # runs. Only on the first request of a window, and only sometimes,
            # so the delete is rare rather than per-request.
            if n == 0 and (now % 101) < 4:
                c.execute("DELETE FROM ratelimit WHERE win < ?", (win - 2,))
            c.commit()
            c.close()
        return True, 0
    except Exception as e:
        print("rate limit check failed, allowing the request: %s: %s" % (type(e).__name__, _redact(e)))
        return True, 0


_UPLOAD_NAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|pdf)$")
# What an upload may be, told by its first bytes and not by the data URL's
# label: a camera or gallery picture (JPEG/PNG), or a PDF such as a DigiLocker
# licence. Anything else was stored as ".jpg" before, whatever it really was.
_UPLOAD_KINDS = ((b"\xff\xd8\xff", "jpg", "image/jpeg"),
                 (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
                 (b"%PDF-", "pdf", "application/pdf"))
UPLOAD_CTYPES = {ext: ctype for _, ext, ctype in _UPLOAD_KINDS}


def delete_uploads(urls):
    """Remove uploaded images for good: a replaced document photo, a removed
    document, a crew member removed from the register.

    Nothing ever deleted an upload, so an Aadhaar or licence photo stayed
    reachable at its link after the person and their record were gone. Only
    names this server generated are touched."""
    removed = 0
    for url in urls or []:
        if not isinstance(url, str):
            continue
        name = url.rsplit("/", 1)[-1].split("?", 1)[0]
        if not _UPLOAD_NAME.match(name):
            continue
        if _USE_R2 and R2_PUBLIC_URL and url.startswith(R2_PUBLIC_URL.rstrip("/") + "/"):
            try:
                _r2_client().delete_object(Bucket=R2_BUCKET, Key=name)
                removed += 1
            except Exception as e:
                print("R2 delete failed:", _redact(e))
            continue
        if "/uploads/" in url:
            fp = os.path.join(UPLOADS, name)
            if os.path.isfile(fp):
                try:
                    os.remove(fp)
                    removed += 1
                except OSError:
                    pass
    return removed


def save_upload(data_url, host, proto="http"):
    """Store one upload and return {"url"}, or {"error"} when it is not a JPEG,
    PNG or PDF."""
    _head, _, b64 = data_url.partition(",")
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        return {"error": "not valid base64"}
    kind = next((k for k in _UPLOAD_KINDS if raw.startswith(k[0])), None)
    if not kind:
        return {"error": "only JPEG, PNG or PDF files can be uploaded"}
    _, ext, ctype = kind
    name = uuid.uuid4().hex + "." + ext
    # Cloudflare R2 (free, persistent) when configured — the image lives in object
    # storage and its permanent public URL syncs in the record. Falls back to local
    # disk otherwise (ephemeral on a free host).
    if _USE_R2:
        try:
            _r2_client().put_object(Bucket=R2_BUCKET, Key=name, Body=raw, ContentType=ctype)
            return {"url": f"{R2_PUBLIC_URL}/{name}"}
        except Exception as e:
            print("R2 upload failed:", _redact(e))
            _R2_PROBE.update(at=time.time(), ok=False, err=type(e).__name__)
    # Local disk is the fallback, and on a serverless host there is no writable
    # one: os.makedirs raised OSError, the request became a 500, and the app
    # quietly kept the picture inside the record instead. Say so rather than
    # crashing, so the client can tell somebody.
    try:
        os.makedirs(UPLOADS, exist_ok=True)
        with open(os.path.join(UPLOADS, name), "wb") as f:
            f.write(raw)
    except OSError as e:
        print("upload fallback failed:", _redact(e))
        return {"error": "photo storage unavailable on the server", "storage": True}
    # Must be HTTPS in production: the PWA is served over HTTPS (GitHub Pages), so
    # an http:// image URL is blocked as mixed content and the photo never shows.
    return {"url": f"{proto}://{host}/uploads/{name}"}


# --------------------------- eChallan lookup -------------------------------
# The upstream returns ~50 fields per challan with three spellings of most of
# them (fine_amount / fine_imposed / amount_of_fine_imposed, service_charge /
# service_charges, created_at / createdAt). Collapse that to the fields the app
# actually shows, and keep the two money figures strictly apart:
#
#   fine     — what is owed to the government. This is the liability.
#   payable  — what eChallan.app bills to settle it through their platform,
#              i.e. fine + their service charge + GST.
#
# A Rs 200 speeding fine comes back as Rs 1,144 payable (Rs 800 service charge +
# Rs 144 GST). Showing the payable figure as "outstanding fines" would overstate
# what the operator owes by ~5x, so both are carried through and labelled.
def _norm_challan(c):
    def num(*keys):
        for k in keys:
            v = c.get(k)
            if v not in (None, ""):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
        return 0.0
    offences = [o.get("name") or o.get("act") or "" for o in (c.get("offence_details") or [])]
    return {
        "challanNo": c.get("challan_no") or c.get("_id"),     # the reconciliation key
        "rc": c.get("rc_no") or c.get("VRN"),
        "date": c.get("challan_date_time") or c.get("original_date_string"),
        "status": c.get("challan_status") or "Unknown",
        "fine": num("fine_imposed", "fine_amount", "amount_of_fine_imposed"),
        "payable": num("total_payable", "total_amount", "display_total"),
        "serviceCharge": num("service_charge", "service_charges"),
        "gst": num("gst_amount"),
        "offence": "; ".join([o for o in offences if o]) or None,
        "place": c.get("challan_place"),
        "state": c.get("state_code"),
        "department": c.get("department"),
        "courtName": c.get("court_name"),
        "sentToCourt": (c.get("sent_to_reg_court") == "Yes") or (c.get("sent_to_virtual_court") == "Yes"),
        "accused": c.get("name_of_violator") or c.get("owner_name"),
        "offlinePayable": bool(c.get("is_offline_payable")),
    }


# --------------------------- Odometer capture ------------------------------
# The problem this solves: every one of the 89 buses carries odometer 0, so
# cost-per-km — the owner's headline maintenance number — has never had anything
# to compute from. Nobody types a reading into an app during a shift. They will
# photograph a dashboard, which is why capture starts from an image and the
# transport (WhatsApp, or the test endpoint) is kept separate from the logic.
#
# Accuracy matters more than coverage here. A misread that turns 45,218 into
# 452,180 silently corrupts cost-per-km for the life of the bus, and nobody would
# notice for months. So every reading is validated against the previous one, an
# implausible jump is held rather than written, and the raw model output is kept
# alongside the number so any figure can be traced back to the photo it came from.

ODO_MAX_DAILY_KM = float(os.environ.get("ODO_MAX_DAILY_KM", "1600"))   # long-haul night runs are ~550 km

# Reading a dashboard is a vision-language job, not OCR: a cluster shows the
# speedometer, trip meter and fuel gauge alongside the odometer, and a plain OCR
# engine returns all of them with no idea which is which. So this needs a model
# that understands "the odometer, not the trip meter" — but it does not need any
# PARTICULAR one, and the cheapest key the operator already has should win.
#
# Three adapters cover essentially every option:
#   anthropic  — Claude
#   gemini     — Google AI Studio keys
#   openai     — anything speaking the OpenAI chat-completions shape, which is
#                OpenAI, OpenRouter, Groq, Together, DeepInfra, and a local
#                Ollama, by pointing VISION_BASE at it
#
# Set VISION_PROVIDER + VISION_KEY + VISION_MODEL. If they are unset the server
# falls back to ANTHROPIC_API_KEY so nothing that already worked stops working.
VISION_PROVIDER = os.environ.get("VISION_PROVIDER", "").strip().lower()
VISION_KEY = os.environ.get("VISION_KEY", "").strip()
VISION_MODEL = os.environ.get("VISION_MODEL", "").strip()
VISION_BASE = os.environ.get("VISION_BASE", "").strip().rstrip("/")

_VISION_DEFAULT_MODEL = {
    "anthropic": AI_MODEL,
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
}


def vision_config():
    """Resolve the provider actually in effect, so /health can report it and the
    operator can see which key is being used without reading the logs."""
    # Anthropic (Opus) first whenever its key is set, by the owner's decision of 18 Oct 2026; the
    # VISION_* provider stays as the fallback. A VISION_MODEL naming another provider's model
    # (gemini-2.5-flash) is never sent to Anthropic.
    if ANTHROPIC_API_KEY:
        own = VISION_MODEL if VISION_MODEL.startswith("claude-") else ""
        return "anthropic", ANTHROPIC_API_KEY, (own or _VISION_DEFAULT_MODEL["anthropic"])
    if VISION_PROVIDER and VISION_KEY:
        return VISION_PROVIDER, VISION_KEY, (VISION_MODEL or _VISION_DEFAULT_MODEL.get(VISION_PROVIDER, ""))
    return "", "", ""


# WhatsApp Cloud API. All four are needed for the live transport; without them
# the odometer flow still works through /odometer/submit, which is how the pilot
# is measured before Meta approves the Business account.
WA_TOKEN = os.environ.get("WA_TOKEN", "")               # permanent system-user token
WA_PHONE_ID = os.environ.get("WA_PHONE_ID", "")         # sender phone-number id
WA_VERIFY_TOKEN = os.environ.get("WA_VERIFY_TOKEN", "") # echoed back on webhook setup
WA_APP_SECRET = os.environ.get("WA_APP_SECRET", "")     # validates X-Hub-Signature-256
WA_ALLOW_UNSIGNED = os.environ.get("WA_ALLOW_UNSIGNED", "") == "1"   # local testing only
WA_PROMPT_TEMPLATE = os.environ.get("WA_PROMPT_TEMPLATE", "")   # approved template for out-of-window sends
WA_TEMPLATE_LANG = os.environ.get("WA_TEMPLATE_LANG", "en")


def wa_send(to, text, last_inbound_ms=None):
    """Reply to a driver.

    Branches on the 24-hour service window rather than sending and hoping. Meta
    rejects free-form text outside it, and repeatedly retrying a rejected send is
    what gets a sender's quality rating downgraded — so outside the window this
    falls back to the approved prompt template instead. Ported understanding from
    the Zappie codebase's inbox_policy; the original server sent free-form
    unconditionally, which would have failed silently for any driver who had not
    messaged in a day.
    """
    if not (WA_TOKEN and WA_PHONE_ID):
        return False
    try:
        if last_inbound_ms is None or wa_client.can_send_freeform(last_inbound_ms, now_ms()):
            wa_client.send_text(WA_TOKEN, WA_PHONE_ID, to, text)
        elif WA_PROMPT_TEMPLATE:
            wa_client.send_template(WA_TOKEN, WA_PHONE_ID, to, WA_PROMPT_TEMPLATE, WA_TEMPLATE_LANG)
        else:
            return False
        return True
    except wa_client.WAError:
        return False


def wa_prompt_odometer(to):
    """Business-initiated shift-end prompt. Always a template — by definition the
    driver has not just messaged us, so the window is shut."""
    if not (WA_TOKEN and WA_PHONE_ID and WA_PROMPT_TEMPLATE):
        return False
    try:
        wa_client.send_template(WA_TOKEN, WA_PHONE_ID, to, WA_PROMPT_TEMPLATE, WA_TEMPLATE_LANG)
        return True
    except wa_client.WAError:
        return False


def _wa_last_inbound(phone):
    """When this number last wrote to us, which decides free-form vs template."""
    tail = re.sub(r"\D", "", phone or "")[-10:]
    with _lock:
        c = db()
        row = c.execute("SELECT data FROM records WHERE store='waconv' AND id=?", (tail,)).fetchone()
        c.close()
    if not row:
        return None
    try:
        return json.loads(row[0]).get("lastInboundAt")
    except Exception:
        return None


def _wa_note_inbound(phone, wa_message_id):
    tail = re.sub(r"\D", "", phone or "")[-10:]
    now = now_ms()
    rec = {"id": tail, "phone": tail, "lastInboundAt": now,
           "lastMessageId": wa_message_id, "updatedAt": now}
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "waconv", tail, rec, now, rev)
        c.commit(); c.close()


def _wa_handle(body):
    """Process one webhook delivery off the request thread.

    Async because OCR takes seconds and Meta times the webhook out at 20 — a slow
    reply is retried, and the driver would get the same answer twice.
    """
    try:
        for entry in wa_client.extract_entries(body):
            for raw in entry.get("messages", []):
                msg = wa_client.normalize_message(raw)
                frm = msg.get("from") or ""
                if not frm:
                    continue
                # Record the inbound BEFORE replying: it opens the service window,
                # and the reply itself depends on that window being known open.
                _wa_note_inbound(frm, msg.get("id"))
                if msg.get("id"):
                    wa_client.mark_read(WA_TOKEN, WA_PHONE_ID, msg["id"])
                last = _wa_last_inbound(frm)

                if msg["type"] == "image" and msg.get("media_id"):
                    try:
                        img = wa_client.media_data_url(WA_TOKEN, msg["media_id"])
                    except wa_client.WAError:
                        wa_send(frm, "Photo nahi mila. Dobara bhejein.", last)
                        continue
                    res = odometer_submit(frm, img, source="whatsapp")
                    wa_send(frm, res.get("reply") or "Ho gaya.", last)
                else:
                    wa_send(frm, "Meter ka photo bhejein — bas photo, aur kuch nahi.", last)
    except Exception:
        pass


def bus_by_phone(phone):
    """Find the bus whose crew phone matches. Last 10 digits, so +91/0 prefixes
    and spacing don't matter — crew give their number a different way each time."""
    tail = re.sub(r"\D", "", phone or "")[-10:]
    if len(tail) < 10:
        return None
    with _lock:
        c = db()
        rows = c.execute("SELECT id,data FROM records WHERE store='buses'").fetchall()
        crew = c.execute("SELECT data FROM records WHERE store='drivers'").fetchall()
        c.close()
    buses = {}
    for rid, raw in rows:
        try:
            b = json.loads(raw)
        except Exception:
            continue
        if isinstance(b, dict) and not b.get("_deleted"):
            buses[rid] = b
    # The crew bank decides who crews which bus, and it follows people when they
    # leave, are archived or move. buses.crewPhone is a copy made once from the
    # route sheet and never updated, so a driver who left kept writing his old
    # bus's odometer. An active crew member with this number on a bus wins; a
    # number that belongs only to crew who have left binds nothing.
    departed = False
    for raw, in crew:
        try:
            d = json.loads(raw)
        except Exception:
            continue
        if not isinstance(d, dict) or re.sub(r"\D", "", str(d.get("phone") or ""))[-10:] != tail:
            continue
        if d.get("_deleted") or d.get("status") in ("left", "archived"):
            departed = True
            continue
        if d.get("busId") in buses:
            return buses[d["busId"]]
    if departed:
        return None
    for b in buses.values():
        if re.sub(r"\D", "", str(b.get("crewPhone") or ""))[-10:] == tail:
            return b
    return None


ODO_PROMPT = (
    "This is a photo of a bus instrument cluster. Read the ODOMETER — the total "
    "distance travelled, in kilometres. Ignore the trip meter, speedometer, fuel "
    "gauge and any warning lights.\n"
    "Reply with ONLY the digits, no commas, no units, no explanation. "
    "If you cannot read the odometer clearly, reply with exactly: NONE"
)


def _post_json(url, payload, headers, timeout=45):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers=dict(headers, **{"content-type": "application/json"}))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def vision_read_odometer(image_data_url):
    """Read the odometer from a dashboard photo. Returns (km:int|None, raw:str).

    Every adapter asks for a bare number or the literal word NONE. A model that
    hedges in prose ("it looks like around 45,000") yields a number that is not a
    reading, and writing that into the fleet record is worse than capturing
    nothing — so anything that isn't clean digits is treated as unreadable and the
    driver is asked again.
    """
    provider, key, model = vision_config()
    if not provider:
        return None, "no vision provider configured"
    try:
        header, b64 = image_data_url.split(",", 1)
        media = header.split(";")[0].split(":")[1] if ":" in header else "image/jpeg"
    except Exception:
        return None, "bad image"

    try:
        if provider == "anthropic":
            j = _post_json("https://api.anthropic.com/v1/messages", {
                "model": model, "max_tokens": 16,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                    {"type": "text", "text": ODO_PROMPT}]}],
            }, {"x-api-key": key, "anthropic-version": "2023-06-01"})
            text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()

        elif provider == "gemini":
            base = VISION_BASE or "https://generativelanguage.googleapis.com/v1beta"
            # Key goes in the header, not the query string — a URL with a secret in
            # it ends up in proxy and access logs.
            j = _post_json(f"{base}/models/{model}:generateContent", {
                "contents": [{"parts": [
                    {"inline_data": {"mime_type": media, "data": b64}},
                    {"text": ODO_PROMPT}]}],
                "generationConfig": {"maxOutputTokens": 16},
            }, {"x-goog-api-key": key})
            cands = j.get("candidates") or []
            parts = (cands[0].get("content", {}).get("parts") or []) if cands else []
            text = "".join(p.get("text", "") for p in parts).strip()

        elif provider == "openai":
            # Also covers OpenRouter, Groq, Together, DeepInfra and a local Ollama —
            # they all speak this shape; only the base URL and model name change.
            base = VISION_BASE or "https://api.openai.com/v1"
            j = _post_json(f"{base}/chat/completions", {
                "model": model, "max_tokens": 16,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": ODO_PROMPT},
                    {"type": "image_url", "image_url": {"url": image_data_url}}]}],
            }, {"authorization": f"Bearer {key}"})
            text = ((j.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()

        else:
            return None, f"unknown vision provider: {provider}"

    except urllib.error.HTTPError as e:
        # Surface the status — a 429 (out of quota) reads identically to a broken
        # key otherwise, and they need different fixes.
        return None, f"{provider} HTTP {e.code}"
    except Exception:
        return None, f"{provider} unreachable"

    digits = re.sub(r"\D", "", text or "")
    if not digits or "NONE" in (text or "").upper():
        return None, text or "empty response"
    return int(digits), text


def odometer_submit(phone, image_data_url, source="test", dry=False):
    """Core capture path, shared by the WhatsApp webhook and the test endpoint.

    Returns a dict with `status` — one of enrol / unreadable / held / accepted —
    and a `reply` written for a driver to read on a phone, in the register the
    crew actually use rather than app English.

    `dry` runs the read and the validation but writes nothing, so OCR accuracy can
    be measured against real photos without moving the fleet's odometers. The
    whole point of measuring first is to not corrupt the baseline while doing it.
    """
    bus = bus_by_phone(phone)
    if not bus:
        return {"status": "enrol", "reply":
                "Yeh number kisi bus se linked nahi hai. Office se apna number "
                "register karwayein."}

    km, raw = vision_read_odometer(image_data_url)
    if km is None:
        return {"status": "unreadable", "bus": bus.get("regNo"), "raw": raw, "reply":
                "Meter clear nahi dikha. Thoda paas se, seedha photo bhejein."}

    prev = int(bus.get("odometer") or 0)
    now = now_ms()
    wa = source == "whatsapp"
    log = {
        "id": "odo-" + uuid.uuid4().hex[:12],
        "busId": bus.get("id"), "reg": bus.get("regNo"),
        "km": km, "prevKm": prev, "delta": (km - prev) if prev else None,
        "phone": re.sub(r"\D", "", phone or "")[-10:],
        "raw": raw, "source": source, "at": now, "updatedAt": now,
        "status": "accepted",
    }

    # The owner marked this bus's meter as broken; nothing it shows is a reading.
    if bus.get("odoBroken"):
        log["status"] = "held-broken"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: meter kharab mark hai, reading darj nahi hui. Office ko batayein."}

    # A bus with no reading yet takes whatever the first message says as its
    # baseline, forever. From a phone that is for a person to confirm.
    if wa and not prev:
        log["status"] = "held-first"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: pehli reading {km:,} km. Office confirm karega."}

    # A reading that goes backwards is either a misread or the wrong bus. Never
    # write it — a decreasing odometer would make every downstream km figure
    # negative and is not recoverable once it has propagated to devices.
    if prev and km < prev:
        log["status"] = "held-backwards"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: {km:,} km pichhli reading ({prev:,} km) se kam hai. "
                "Office check karega. Dobara photo bhej sakte hain."}

    # A jump too large to be one day's running is held for a human rather than
    # written. This is the digit-slip case (45,218 read as 452,180) and it is the
    # one that would quietly poison cost-per-km for months.
    if prev and (km - prev) > ODO_MAX_DAILY_KM:
        log["status"] = "held-jump"
        if not dry:
            _write_odo_log(log)
        return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                f"{bus.get('regNo')}: {km:,} km — pichhli baar se {km - prev:,} km zyada. "
                "Office confirm karega."}

    # The per-message limit alone let repeated photos walk the odometer up
    # without bound, 1,600 km at a time. Over a day, from a phone, the total is
    # capped too: measured from the reading this bus had before its first
    # WhatsApp update in the last 24 hours.
    if wa and prev:
        base = prev
        with _lock:
            c = db()
            for raw, in c.execute("SELECT data FROM records WHERE store='odometerlogs'").fetchall():
                try:
                    lg = json.loads(raw)
                except Exception:
                    continue
                if (isinstance(lg, dict) and lg.get("busId") == bus.get("id") and lg.get("status") == "accepted"
                        and lg.get("source") == "whatsapp" and now - int(lg.get("at") or 0) < 86400000
                        and lg.get("prevKm")):
                    base = min(base, int(lg["prevKm"]))
            c.close()
        if km - base > ODO_MAX_DAILY_KM:
            log["status"] = "held-daily"
            if not dry:
                _write_odo_log(log)
            return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                    f"{bus.get('regNo')}: aaj ki readings milakar {km - base:,} km ho gaye. Office confirm karega."}

    if dry:
        return {"status": "accepted", "dry": True, "bus": bus.get("regNo"), "km": km,
                "prev": prev, "raw": raw,
                "reply": f"[dry] {bus.get('regNo')}: {km:,} km read, nothing written."}

    with _lock:
        c = db()
        # Re-read the bus under the lock and change only the odometer. The copy
        # read before the vision call can be a minute old, and writing it back
        # whole silently undid any owner or supervisor edit made meanwhile.
        row = c.execute("SELECT data FROM records WHERE store='buses' AND id=?", (bus["id"],)).fetchone()
        try:
            cur = json.loads(row[0]) if row else None
        except Exception:
            cur = None
        changed = (not isinstance(cur, dict) or cur.get("_deleted") or cur.get("odoBroken")
                   or int(cur.get("odometer") or 0) > km)
        if changed:
            log["status"] = "held-changed"
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "odometerlogs", log["id"], log, now, rev)
            c.commit(); c.close()
            return {"status": "held", "bus": bus.get("regNo"), "km": km, "reply":
                    f"{bus.get('regNo')}: bus ki details abhi badli hain. Office check karega."}
        cur["odometer"] = km
        cur["odometerAt"] = now
        cur["updatedAt"] = max(now, int(cur.get("updatedAt") or 0) + 1)
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        rev = _upsert_record(c, "buses", cur["id"], cur, cur["updatedAt"], rev)
        _upsert_record(c, "odometerlogs", log["id"], log, now, rev)
        c.commit(); c.close()

    delta = f" (+{km - prev:,} km)" if prev else ""
    return {"status": "accepted", "bus": bus.get("regNo"), "km": km, "prev": prev,
            "reply": f"{bus.get('regNo')}: {km:,} km darj ho gaya{delta}. Dhanyavaad."}


def _write_odo_log(log):
    with _lock:
        c = db()
        rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
        _upsert_record(c, "odometerlogs", log["id"], log, log["at"], rev)
        c.commit(); c.close()


def store_challan_snapshot(payload):
    """Write one bus's snapshot into the synced record set, keyed by registration.

    Goes through the same records table every other store uses, so it rides the
    normal /pull to every device with no extra plumbing. Failure here must not
    fail the caller's lookup — they already paid the credit and should still get
    their answer.
    """
    try:
        with _lock:
            c = db()
            rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
            _upsert_record(c, "challans", payload["rc"], payload, payload["updatedAt"], rev)
            c.commit(); c.close()
    except Exception:
        pass


def echallan_lookup(rc_no):
    """One upstream challan lookup. Returns (payload, error_tuple_or_None).

    Asks for the OFFICIAL form of the plate — district to two digits, number to
    four — because that is how the registry holds it. The fleet list dropped the
    zero on 15 buses, and a lookup for MP44ZD471 against a registry that knows
    MP44ZD0471 does not fail: it comes back empty, which the app shows as a green
    "no pending challans". A miss that looks like a clean bill is the one outcome
    this feature exists to prevent.

    The snapshot is stored under that same padded key. Snapshots written before
    this change sit under the old spelling; the app reconciles the two and does
    not trust an old one that found nothing (see challanSnapshots() in app.js)."""
    rc = norm_reg(re.sub(r"[^A-Za-z0-9]", "", (rc_no or "")))
    if not rc:
        return None, (400, {"error": "rc_no required"})
    url = f"{ECHALLAN_BASE}/vahanfin/echallan?rc_no={urllib.parse.quote(rc)}"
    # The edge in front of this API 403s the default "Python-urllib/3.x" agent.
    # Any ordinary UA passes; without one every lookup fails as Forbidden.
    req = urllib.request.Request(url, headers={
        "X-API-Key": ECHALLAN_API_KEY,
        "User-Agent": "GarageSaathi/1.0 (+https://github.com/Bhuwangarg/garage-saathi)",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            j = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        # 402 is out of credits — worth its own message, it is not a bug.
        if e.code == 402:
            return None, (402, {"error": "eChallan credits exhausted", "rc": rc})
        if e.code in (401, 403):
            return None, (502, {"error": "eChallan rejected the API key", "rc": rc})
        return None, (502, {"error": f"eChallan upstream error {e.code}", "rc": rc})
    except Exception:
        return None, (502, {"error": "eChallan unreachable", "rc": rc})

    rows = [_norm_challan(c) for c in (j.get("challans") or [])]
    pending = [r for r in rows if r["status"] == "Pending"]
    billing = j.get("_billing") or {}
    return {
        "rc": rc,
        # `updatedAt` is what the client's last-write-wins comparison reads. Without
        # it every pulled refresh would compare 0 > 0 and be silently discarded, so
        # a device would keep its first snapshot forever.
        "updatedAt": now_ms(),
        "fetchedAt": now_ms(),
        # A repeat lookup inside their cache window bills 0, and a provider outage
        # bills 0 too — so cost is per-fetch, not per-call. Surfaced so the app can
        # show what a fleet sweep actually spent.
        "creditsUsed": billing.get("cost"),
        "creditsLeft": billing.get("remaining_credits"),
        "providerUnavailable": bool(j.get("provider_unavailable")),
        "total": j.get("total_count", len(rows)),
        "pendingCount": j.get("pending_count", len(pending)),
        "disposedCount": j.get("disposed_count", len(rows) - len(pending)),
        "pendingFine": round(sum(r["fine"] for r in pending), 2),
        "pendingPayable": round(sum(r["payable"] for r in pending), 2),
        "courtCount": sum(1 for r in rows if r["sentToCourt"]),
        "challans": rows,
    }, None


# ------------------------------- HTTP --------------------------------------
class Handler(BaseHTTPRequestHandler):
    # A connection that stops sending holds a thread; do not wait on it forever.
    timeout = 60

    def _send(self, code, payload=None, raw=None, ctype="application/json", cache=None, retry_after=None):
        if raw is not None:
            body = raw
        else:
            body = json.dumps(payload).encode() if payload is not None else b""
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", cors_origin_for(self.headers.get("Origin")))
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", ctype)
        if cache:
            self.send_header("Cache-Control", cache)
        if retry_after:
            self.send_header("Retry-After", str(int(retry_after)))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _unversion(self, path):
        """Map /v1/x to /x. A version we do not speak is left to 404."""
        bare, want = _strip_version(path)
        if want is not None and want != PROTOCOL_VERSION:
            return path
        return bare

    def _rate_limited(self, me, bucket):
        """True when this request has been answered with a 429 and the caller
        must stop. Checked after auth, so the counter is per person."""
        ok, wait = _rate_ok((me or {}).get("id"), bucket)
        if ok:
            return False
        print("rate limit: %s hit the %s ceiling, told to wait %ds" % ((me or {}).get("id"), bucket, wait))
        self._send(429, {"error": "too many requests", "retryAfterSec": wait}, retry_after=wait)
        return True

    def _body(self):
        n = self._content_length() or 0
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def _content_length(self):
        """The declared body size, or None if it is unusable.

        The header was trusted as given: a negative value read until the client
        hung up (and slipped under the upload cap, since -1 is not greater than
        it), and a huge one was buffered in full before any login was checked."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        return n if 0 <= n <= MAX_REQUEST_BYTES else None

    def _raw_body(self):
        """Undecoded bytes — Meta's webhook signature is computed over the exact
        payload, so it cannot be re-serialised from parsed JSON."""
        n = self._content_length() or 0
        try:
            return self.rfile.read(n) or b""
        except Exception:
            return b""

    def _auth_user(self):
        h = self.headers.get("Authorization") or ""
        token = h[7:] if h.startswith("Bearer ") else ""
        return user_for_token(token)

    def do_OPTIONS(self):
        self._send(204)

    def parse_request(self):
        """Restore the client's original path.

        Vercel rewrites do not pass the requested URL through to the function —
        the handler receives the rewrite DESTINATION. Measured on the live
        deployment: a request for /health arrived as /api/index, and /auth/login
        as /api/index?path=login, so every route except / returned 404 while
        looking perfectly correct from outside.

        vercel.json therefore rewrites to /api/index?__p=<original path>, and this
        puts it back before any routing happens. Any other query parameters the
        client sent are preserved. A direct request (local, Render, Docker) has no
        __p and is left untouched.
        """
        ok = BaseHTTPRequestHandler.parse_request(self)
        if not ok:
            return ok
        try:
            u = urlparse(self.path)
            q = parse_qs(u.query, keep_blank_values=True)
            orig = (q.pop("__p", [""]) or [""])[0]
            if orig.startswith("/"):
                rest = urlencode([(k, v) for k, vs in q.items() for v in vs])
                self.path = orig + ("?" + rest if rest else "")
        except Exception:
            pass                       # never let path rewriting break a request
        return ok

    def handle_one_request(self):
        # Kept for the long-running server (Render, Docker, local), where this is
        # the choke point. Vercel bypasses it, which is why do_GET/do_POST call
        # _boot() as well; bootstrap() itself is idempotent.
        self._boot()
        return BaseHTTPRequestHandler.handle_one_request(self)

    def do_GET(self):
        self._boot()
        u = urlparse(self.path)._replace(path=self._unversion(urlparse(self.path).path))
        # "/" is the app when the PWA is bundled with the function, and only falls
        # back to health when it is not (a backend-only deploy). /health is always
        # health, which is what the keepalive cron and every deploy check use.
        if u.path == "/" and self._serve_static("/index.html"):
            return
        if u.path in ("/", "/health"):
            _gps_hydrate()                                 # accurate live count on serverless (fresh container)
            _turso_live = bool(_USE_TURSO and _TURSO_OK)   # actually connected, not just configured
            # `persistent` must mean "survives a redeploy", which disk-backed SQLite
            # does. Reporting it as False there sent us chasing a data-loss scare
            # that was really just a naming bug.
            # Postgres is durable by definition — if we can answer at all, the
            # connection came up, because _connect() refuses to start without it.
            _db_ok, _db_err = db_probe()
            _persistent = (_USE_PG and _db_ok) or _turso_live or (not _USE_TURSO and _DISK_PERSISTENT)
            _mode = ("postgres" if (_USE_PG and _db_ok) else
                     "postgres-unreachable" if _USE_PG else
                     "turso" if _turso_live else
                     ("sqlite-disk" if _persistent else "sqlite-ephemeral"))
            # diskVerified is the only trustworthy signal: true means data written
            # before a previous restart was still on disk at this boot.
            _verified = None if _turso_live else (_DISK_BOOTS > 1)
            return self._send(200, {"ok": True, "service": "garage-saathi-sync", "db": "turso" if _turso_live else "sqlite",
                                     "dbMode": _mode, "dbPath": None if _turso_live else DB,
                                     "dbOk": _db_ok, "dbError": _db_err,
                                     "bootstrapped": _BOOTSTRAPPED, "bootstrapError": _BOOT_ERROR,
                                     # Whether a restore is possible at all. The 403 from
                                     # /admin/import cannot tell "your token is wrong" from
                                     # "the server has none", and the value is write-only in
                                     # the dashboard, so neither side could check. Presence
                                     # only — never the value.
                                     "importTokenSet": bool(os.environ.get("IMPORT_TOKEN", "").strip()),
                                     # Identifies the DEPLOYMENT, not the source. BUILD_TAG only
                                     # moves when code changes, so it cannot tell a redeploy from
                                     # no redeploy — and env values only refresh on a rebuild, so
                                     # that is exactly the question that keeps coming up.
                                     "deployId": os.environ.get("VERCEL_DEPLOYMENT_ID")
                                                 or os.environ.get("VERCEL_URL"),
                                     "commit": (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "")[:7] or None,
                                     "diskVerified": None if _USE_PG else _verified,
                                     "diskBoots": _DISK_BOOTS, "diskError": _DISK_ERROR,
                                     # Host only — never the password, /health is public.
                                     "pgHost": _pg_host(),
                                     "persistent": _persistent, "tursoConfigured": _USE_TURSO, "tursoConnected": _TURSO_OK,
                                     "urlSet": bool(TURSO_URL), "tokenSet": bool(TURSO_TOKEN),
                                     "aiKeySet": bool(ANTHROPIC_API_KEY), "vapidReady": _WEBPUSH and bool(_vapid_pem_path()),
                                     # Two separate facts, because they fail separately and the
                                     # symptom is identical from outside: `build` is the commit
                                     # actually running (auto-deploy is off, so a restart can pick
                                     # up a new env var while still serving old code), and
                                     # echallanKeySet is whether the key reached the process.
                                     "build": BUILD_TAG, "echallanKeySet": bool(ECHALLAN_API_KEY),
                                     "schemaVersion": SCHEMA_VERSION, "protocol": PROTOCOL_VERSION,
                                     "flags": feature_flags(),
                                     "rateLimit": {"syncPerMin": RL_SYNC_PER_MIN,
                                                   "uploadPerHour": RL_UPLOAD_PER_HOUR,
                                                   "off": RATE_LIMIT_OFF},
                                     # Which key the odometer OCR will actually use. Names the
                                     # provider and model but never the key, so a misconfigured
                                     # switch is visible without dashboard access.
                                     "vision": {"provider": vision_config()[0] or None,
                                                "model": vision_config()[2] or None},
                                     "photos": "r2" if _USE_R2 else "disk", "photosPersistent": _USE_R2,
                                     # Per-var presence (booleans only, no secrets) so a missing/misnamed
                                     # R2 env var can be pinpointed without dashboard access.
                                     "r2Vars": {"R2_ACCOUNT_ID": bool(R2_ACCOUNT_ID), "R2_ACCESS_KEY_ID": bool(R2_ACCESS_KEY),
                                                "R2_SECRET_ACCESS_KEY": bool(R2_SECRET_KEY), "R2_BUCKET": bool(R2_BUCKET),
                                                "R2_PUBLIC_URL": bool(R2_PUBLIC_URL)},
                                     # Whether the bucket answers, not just whether it is configured.
                                     "r2": r2_probe(),
                                     "gpsIngest": _GPS_TOKEN_OK, "gpsLiveRegs": len(LIVE_GPS)})
        if u.path.startswith("/uploads/"):
            name = os.path.basename(u.path)
            fp = os.path.join(UPLOADS, name)
            if not os.path.isfile(fp):
                return self._send(404, {"error": "not found"})
            if not _UPLOAD_NAME.match(name):
                return self._send(404, {"error": "not found"})
            ct = UPLOAD_CTYPES[name.rsplit(".", 1)[1]]
            with open(fp, "rb") as f:
                return self._send(200, raw=f.read(), ctype=ct)
        # The login screen is built from whoever this device knows about, and a
        # device that has never synced knows only the bundled roster. So a person
        # created on the office laptop had no tile on a new phone, and the tile is
        # what you need in order to sign in and sync. Unauthenticated on purpose:
        # seed-data.js already ships every staff name to anyone who opens the app,
        # so this exposes nothing new — and it carries no PIN, hash or salt.
        if u.path == "/roster":
            with _lock:
                c = db()
                rows = c.execute("SELECT id,name,role FROM users ORDER BY role,name").fetchall()
                c.close()
            return self._send(200, {"users": [{"id": r[0], "name": r[1], "role": r[2]} for r in rows]})
        if u.path == "/my/coaching":                 # a driver/conductor's own approved weekly notes
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if self._rate_limited(me, "sync"):
                return None
            return self._send(200, my_coaching(me["id"]), cache="no-store")
        if u.path == "/my/reviews":                  # a driver/conductor's own redBus reviews
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if self._rate_limited(me, "sync"):
                return None
            return self._send(200, crew_reviews_for(me["id"]), cache="no-store")
        if u.path == "/pull":
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if self._rate_limited(me, "sync"):
                return None
            since = int((parse_qs(u.query).get("since") or ["0"])[0])
            out = pull(since, actor=me)
            # Carried on every pull rather than fetched separately: a flag the
            # client learns about a tick late is fine, one it has to make an
            # extra request for will not be read at all.
            out["flags"] = feature_flags()
            out["protocol"] = PROTOCOL_VERSION
            return self._send(200, out, cache="no-store")
        if u.path == "/gps":
            # Live position, speed and ignition of a named bus. Registration
            # numbers are painted on the buses, so this must not be anonymous.
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            q = parse_qs(u.query)
            bus_id = (q.get("busId") or [""])[0]
            if not bus_id:
                return self._send(400, {"error": "busId required"})
            odo = float((q.get("odo") or ["0"])[0] or 0)
            reg = (q.get("reg") or [""])[0]
            _gps_hydrate()
            return self._send(200, gps_telemetry(bus_id, odo, reg))
        if u.path == "/push/vapid":                   # public VAPID key for the browser to subscribe
            return self._send(200, {"publicKey": VAPID_PUBLIC, "enabled": _WEBPUSH and bool(_vapid_pem_path()),
                                    "webpush": _WEBPUSH,
                                    "keyEnv": bool(os.environ.get("VAPID_PRIVATE_KEY")),   # is the env var visible to the process?
                                    "secretFile": os.path.exists("/etc/secrets/vapid_private.pem")})
        if u.path == "/gps/latest":                  # provider self-check
            # The provider checks a push landed with its own ingest token; the
            # app uses a session. Anyone else gets nothing.
            prov = _GPS_TOKEN_OK and hmac.compare_digest(
                self.headers.get("Authorization", ""), "Bearer " + GPS_INGEST_TOKEN)
            if not prov and not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            reg = (parse_qs(u.query).get("reg") or [""])[0]
            _gps_hydrate()
            data = LIVE_GPS.get(norm_reg(reg))
            return self._send(200 if data else 404, data or {"error": "no telemetry for reg"})
        if u.path == "/gps/fleet":                    # every registration AirFi has pushed
            if not self._auth_user():
                return self._send(401, {"error": "unauthorized"})
            _gps_hydrate()
            buses = [{"reg": v.get("reg") or k, "odometer": v.get("odometer"), "lastPing": v.get("lastPing"),
                      "lat": v.get("lat"), "lng": v.get("lng"), "speedKph": v.get("speedKph"), "ignition": v.get("ignition")}
                     for k, v in LIVE_GPS.items()]
            return self._send(200, {"buses": sorted(buses, key=lambda b: b["reg"])})

        if u.path == "/wa/webhook":
            # Meta's one-time verification handshake: echo hub.challenge back in
            # plain text when the token matches. Anything else must not 200, or the
            # webhook registers against a token we never agreed.
            q = parse_qs(u.query)
            mode = (q.get("hub.mode") or [""])[0]
            token = (q.get("hub.verify_token") or [""])[0]
            challenge = (q.get("hub.challenge") or [""])[0]
            if mode == "subscribe" and WA_VERIFY_TOKEN and token == WA_VERIFY_TOKEN:
                body = challenge.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return self._send(403, {"error": "verification failed"})

        if u.path == "/challans":     # eChallan proxy — keeps the API key OFF devices
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            # Outstanding fines and court referrals are finance data, and each
            # lookup spends a billable credit. Same gate as the money screens.
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            if not ECHALLAN_API_KEY:
                return self._send(501, {"error": "eChallan not configured on server"})
            rc = (parse_qs(u.query).get("rc_no") or [""])[0]
            payload, err = echallan_lookup(rc)
            if err:
                return self._send(err[0], err[1])
            # Persist so the whole fleet's snapshot is fetched once, not once per
            # device. Lookups are billable, and challan liability is something the
            # supervisor needs to see without re-paying for it on their own phone.
            store_challan_snapshot(payload)
            return self._send(200, payload)

        # Echo the path the process actually received. Behind a platform that
        # rewrites URLs (Vercel routes everything to one function) the request the
        # handler sees is not always the one the client sent, and without this the
        # symptom is an unexplainable 404 on a route that demonstrably exists.
        if self._serve_static(u.path):
            return
        self._send(404, {"error": "not found", "sawPath": self.path,
                         "sawMethod": self.command})

    def _serve_static(self, path):
        """Serve a PWA file from the app root. Returns True if it handled it."""
        rel = path.lstrip("/") or "index.html"
        ext = os.path.splitext(rel)[1].lower()
        if ext not in _STATIC_OK:
            return False
        segs = [p for p in rel.split("/") if p]
        if not segs or segs[0] in _STATIC_DENY_DIRS or any(p.startswith(".") for p in segs) \
                or "backup" in segs[-1].lower():
            return False
        full = os.path.normpath(os.path.join(APP_ROOT, rel))
        # normpath collapses .., so this rejects traversal after resolution
        # rather than trying to spot it in the raw path.
        if not full.startswith(APP_ROOT + os.sep) or not os.path.isfile(full):
            return False
        try:
            with open(full, "rb") as f:
                body = f.read()
        except Exception:
            return False
        # The service worker must never be cached, or a device pins an old app.js
        # forever. Everything else is fine to cache briefly.
        self._send(200, raw=body, ctype=_CTYPES.get(ext, "application/octet-stream"),
                   cache="no-cache" if rel == "sw.js" else "public, max-age=300")
        return True

    def _boot(self):
        """Vercel dispatches straight to do_GET/do_POST, so handle_one_request is
        not a reliable hook — bootstrap silently never ran there and every login
        returned 'invalid PIN' because no accounts had been seeded. Cheap after the
        first success: bootstrap() returns on a boolean."""
        try:
            bootstrap()
        except Exception as e:
            print("bootstrap failed: %s" % e)

    def do_POST(self):
        self._boot()
        u = urlparse(self.path)._replace(path=self._unversion(urlparse(self.path).path))
        if self._content_length() is None:
            self.close_connection = True
            return self._send(413, {"error": "request body missing a valid size, or too large"})
        if u.path == "/auth/login":
            b = self._body()
            uid = b.get("userId") or ""
            ip = client_ip(self)
            attempt = uuid.uuid4().hex
            wait = reserve_attempt(uid, ip, attempt)
            if wait:
                return self._send(429, {"error": "too many attempts", "retryAfterSec": wait})
            refusal = login_refusal(uid, b.get("pin"))
            if refusal:
                # The right PIN for the account, but one printed in the public
                # source. Not a failed guess, so no lockout strike; `known` makes
                # the app drop any copy it cached instead of signing in offline.
                release_attempt(uid, ip, attempt)
                return self._send(403, {"error": refusal, "known": True})
            r = do_login(uid, b.get("pin"))
            if r and login_disabled(uid):
                # Right PIN, but the crew record says this person has left.
                # Said only after the PIN checks out, so it reveals nothing to
                # someone guessing.
                release_attempt(uid, ip, attempt)
                return self._send(403, {"error": "account_disabled", "known": True})
            if not r:
                # The attempt was already counted by reserve_attempt.
                # `known` lets the client treat this rejection as final instead of
                # falling back to a stale cached PIN. It leaks nothing: the login
                # screen already lists every account on the roster by name and id.
                return self._send(401, {"error": "invalid PIN", "known": user_exists(uid)})
            release_attempt(uid, ip, attempt)
            return self._send(200, r)

        if u.path == "/odometer/submit":
            # Transport-independent capture. Exists so the whole flow — routing,
            # OCR, validation, write — can be exercised and measured before the
            # WhatsApp Business account is approved, and so it stays testable
            # afterwards without sending real messages to crew.
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            phone = (b.get("phone") or "").strip()
            image = b.get("image") or ""
            if not phone or not image.startswith("data:"):
                return self._send(400, {"error": "phone and image (data URL) required"})
            return self._send(200, odometer_submit(phone, image, source="test",
                                                   dry=bool(b.get("dry"))))

        if u.path == "/wa/webhook":
            # WhatsApp Cloud API delivers inbound messages here. Meta retries on any
            # non-200, so this always answers 200 once the payload is understood —
            # a failed OCR is a conversation to have with the driver, not a delivery
            # failure to make Meta repeat.
            # Without the app secret nothing proves a delivery came from Meta, and
            # this used to process it anyway: anyone could post a fake message
            # and get odometer writes and replies from the business number. Refuse
            # instead. WA_ALLOW_UNSIGNED=1 is for local testing only.
            if not WA_APP_SECRET and not WA_ALLOW_UNSIGNED:
                print("wa/webhook refused: WA_APP_SECRET is not set")
                return self._send(503, {"error": "webhook disabled — set WA_APP_SECRET"})
            if WA_APP_SECRET:
                raw = self._raw_body()
                if not wa_client.verify_signature(raw, self.headers.get("X-Hub-Signature-256"), WA_APP_SECRET):
                    return self._send(403, {"error": "bad signature"})
                try:
                    b = json.loads(raw or b"{}")
                except Exception:
                    return self._send(200, {"ok": True})
            else:
                b = self._body()
            threading.Thread(target=_wa_handle, args=(b,), daemon=True).start()
            return self._send(200, {"ok": True})

        if u.path == "/auth/users":          # create staff (owner/supervisor only)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            name, role, pin = (b.get("name") or "").strip(), b.get("role") or "mechanic", str(b.get("pin") or "")
            if not name or not pin:
                return self._send(400, {"error": "name and pin required"})
            if role not in ALL_ROLES:
                return self._send(400, {"error": "unknown role"})
            # The role in the body used to be taken as given, so a supervisor
            # could mint a login with role owner. The app's form refused that;
            # the server did not.
            if not may_manage(me["role"], role):
                return self._send(403, {"error": "only the owner can create that role"})
            if not (len(pin) == 4 and pin.isdigit()):
                return self._send(400, {"error": "pin must be 4 digits"})
            if pin_refusal("", role, pin):
                return self._send(400, {"error": "choose a different PIN"})
            return self._send(200, {"user": create_user(name, role, pin)})

        if u.path == "/auth/users/rename":   # correct a name (owner/supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            uid = (b.get("id") or "").strip()
            # Collapse whitespace and cap the length: this string is rendered on
            # every login screen, and a name is not a place to smuggle layout in.
            name = " ".join((b.get("name") or "").split())[:60]
            if not uid or not name:
                return self._send(400, {"error": "id and name required"})
            with _lock:
                c = db()
                row = c.execute("SELECT role FROM users WHERE id=?", (uid,)).fetchone()
                c.close()
            if not row:
                return self._send(404, {"error": "no such account"})
            # A supervisor may tidy up the yard's names, but relabelling the
            # owner's account is the first move in making a fake one look real.
            if row[0] == "owner" and me["role"] != "owner":
                return self._send(403, {"error": "only the owner can rename an owner account"})
            out = rename_user(uid, name)
            if not out:
                return self._send(404, {"error": "no such account"})
            return self._send(200, {"ok": True, "user": out})

        if u.path == "/auth/users/delete":   # delete a login for good (owner only)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            # Owner only, and checked HERE rather than trusting the client: this
            # removes the credential itself, and a client check is a suggestion.
            if me["role"] != "owner":
                return self._send(403, {"error": "only the owner can delete a login"})
            uid = ((self._body() or {}).get("id") or "").strip()
            if not uid:
                return self._send(400, {"error": "id required"})
            if uid == me["id"]:
                return self._send(400, {"error": "you cannot delete the account you are signed in with"})
            with _lock:
                c = db()
                row = c.execute("SELECT id,name,role FROM users WHERE id=?", (uid,)).fetchone()
                if not row:
                    c.close()
                    return self._send(404, {"error": "no such account"})
                if row[2] == "owner" and c.execute(
                        "SELECT COUNT(*) FROM users WHERE role='owner'").fetchone()[0] <= 1:
                    c.close()
                    return self._send(400, {"error": "that is the last owner — the garage would be locked out"})
                c.execute("DELETE FROM users WHERE id=?", (uid,))
                # Tombstone the synced roster row too, so every device drops the
                # name from its login screen instead of offering an account that
                # can no longer authenticate.
                rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
                _upsert_record(c, "users", uid, {"id": uid, "_deleted": True}, now_ms(), rev)
                c.commit()
                c.close()
            # Historical records still carry this uid in `_by`; that provenance is
            # deliberately left alone, so the trail of who did what stays intact.
            return self._send(200, {"ok": True, "deleted": {"id": row[0], "name": row[1], "role": row[2]}})

        if u.path == "/auth/setpin":         # change own PIN, or owner/supervisor reset staff
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            target = b.get("userId") or me["id"]
            pin = str(b.get("pin") or "")
            if not (len(pin) == 4 and pin.isdigit()):
                return self._send(400, {"error": "pin must be 4 digits"})
            trole = user_role(target)
            if not trole:
                return self._send(404, {"error": "no such user"})
            # Only self, or a manager changing the PIN of someone they manage.
            # The target's role used to go unread, so a supervisor could reset
            # the owner's PIN and then sign in as the owner.
            if target != me["id"] and not may_manage(me["role"], trole):
                return self._send(403, {"error": "forbidden"})
            if pin_refusal(target, trole, pin):
                return self._send(400, {"error": "choose a different PIN"})
            if not set_pin(target, pin):
                return self._send(404, {"error": "no such user"})
            return self._send(200, {"ok": True})

        if u.path == "/admin/backfill-contacts":   # one-time: bundle contacts → server (owner/supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            return self._send(200, backfill_contacts(self._body().get("records"), me))

        if u.path == "/auth/register-roster":   # materialize crew server accounts (owner/supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            pins = {}
            created = register_roster(self._body().get("crew"), pins_out=pins)
            # The PINs go back to this manager's device and nowhere else; the
            # server keeps only their hashes. The response must not be cached.
            return self._send(200, {"ok": True, "created": created, "pins": pins,
                                    "reset": len(pins) - created}, cache="no-store")

        if u.path == "/push":
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if self._rate_limited(me, "sync"):
                return None
            _n = int(self.headers.get("Content-Length") or 0)
            if _n > MAX_PUSH_BYTES:
                return self._send(413, {"error": "push too large (max %d MB) — the device should "
                                                 "send fewer records per tick"
                                                 % (MAX_PUSH_BYTES // (1024 * 1024))})
            recs = self._body().get("records") or []
            if not isinstance(recs, list) or len(recs) > MAX_PUSH_RECORDS:
                return self._send(413, {"error": "too many records in one push (max %d)" % MAX_PUSH_RECORDS})
            res = push(recs, me)
            # A single-record push that was refused still answers 403, because
            # that is the shape older clients read to decide to quarantine.
            # A BATCH never 403s: some of it may have been applied and committed,
            # and the `refused` list says precisely which records were not — so
            # the client quarantines those and keeps the rest.
            if len(recs) == 1 and res.get("applied", 0) == 0 and res.get("rejected", 0):
                return self._send(403, dict(res, error="role not permitted to write this record"))
            return self._send(200, res)

        if u.path == "/admin/import":
            # Restore a device backup into a fresh server.
            #
            # This exists because a normal /push CANNOT restore: push() stamps
            # _by/_byRole from the caller's token, so replaying one device's copy
            # of the garage would re-attribute all 2,800 records to whoever ran the
            # restore — destroying the actor trail the Pilferage Radar reads. Here
            # we call push() with actor=None so the provenance already inside the
            # backup is written through unchanged.
            #
            # Because that also bypasses the write matrix, it is gated three ways:
            # owner token, a secret only present in the host's env, and a refusal
            # to write into a database that already holds records.
            me = self._auth_user()
            if not me or me.get("role") != "owner":
                return self._send(403, {"error": "owner only"})
            want = os.environ.get("IMPORT_TOKEN", "")
            if not want or self.headers.get("X-Import-Token") != want:
                return self._send(403, {"error": "IMPORT_TOKEN not set on the server, or header missing/incorrect"})
            b = self._body()
            recs = b.get("records") or []
            if not b.get("force"):
                with _lock:
                    c = db()
                    # Exclude `users`: seed_users()/register_roster write PIN-free
                    # roster rows at every startup, so a genuinely fresh server is
                    # never literally empty. The guard is about operational data.
                    have = c.execute("SELECT COUNT(*) FROM records WHERE store<>'users'").fetchone()[0]
                    c.close()
                if have:
                    return self._send(409, {"error": "database is not empty", "records": have,
                                            "hint": "pass force:true only if you mean to merge into existing data"})
            return self._send(200, push(recs, None))

        if u.path == "/upload/delete":           # manager: delete replaced/removed photos
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor", "crewmanager"):
                return self._send(403, {"error": "forbidden"})
            urls = self._body().get("urls") or []
            return self._send(200, {"ok": True, "removed": delete_uploads(urls[:200])})

        if u.path == "/upload":
            _me = self._auth_user()
            if not _me:
                return self._send(401, {"error": "unauthorized"})
            if self._rate_limited(_me, "upload"):
                return None
            if int(self.headers.get("Content-Length") or 0) > MAX_UPLOAD_BYTES:
                return self._send(413, {"error": f"upload too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)"})
            data = self._body().get("data") or ""
            if not data.startswith("data:"):
                return self._send(400, {"error": "expected data URL"})
            _host = self.headers.get("Host", f"localhost:{PORT}")
            # Behind Render/any TLS proxy the request arrives as https; honor
            # X-Forwarded-Proto, and default to https for any non-local host.
            _proto = (self.headers.get("X-Forwarded-Proto")
                      or ("http" if _host.startswith(("localhost", "127.")) else "https"))
            saved = save_upload(data, _host, _proto)
            code = 200 if "error" not in saved else (503 if saved.get("storage") else 400)
            return self._send(code, saved)

        if u.path == "/ai":          # server-side Anthropic proxy — keeps the API key OFF devices
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            why = ai_allowed(me)
            if why:
                return self._send(403 if why == "forbidden" else 429, {"error": why})
            if not ANTHROPIC_API_KEY:
                return self._send(501, {"error": "AI not configured on server"})
            b = self._body()
            question = (b.get("question") or "").strip()[:2000]
            context = (b.get("context") or "").strip()
            biz = (b.get("biz") or "the garage").strip()[:80]
            if not question:
                return self._send(400, {"error": "question required"})
            # The advisor with tools over the records (#7). The old one-shot answer below stays as the
            # fallback if the tool loop fails.
            try:
                return self._send(*advise(me, question, biz))
            except Exception as e:
                print("advisor with tools failed, answering without:", type(e).__name__)
            try:
                payload = json.dumps({
                    "model": AI_MODEL,           # never the caller's choice — it sets the bill
                    "max_tokens": 500,
                    "system": f"You are the operations advisor for {biz}, a bus maintenance garage in Jaipur, India. Be concise and practical, use rupee (Rs) figures, focus on cutting cost and pilferage. Max 6 sentences.",
                    "messages": [{"role": "user", "content": f"Current garage data:\n{context}\n\nQuestion: {question}"}],
                }).encode()
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=payload, method="POST", headers={
                    "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    j = json.loads(resp.read())
                text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()
                return self._send(200, {"text": text})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error"})

        if u.path == "/ai/vision":   # Claude vision — part-wear grading + serial OCR
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            why = ai_allowed(me)
            if why:
                return self._send(403 if why == "forbidden" else 429, {"error": why})
            if not ANTHROPIC_API_KEY:
                return self._send(501, {"error": "AI not configured on server"})
            b = self._body()
            image = (b.get("image") or "")        # data URL: data:image/jpeg;base64,XXXX
            prompt = (b.get("prompt") or "").strip()
            if not image.startswith("data:") or "," not in image or not prompt:
                return self._send(400, {"error": "image (data URL) and prompt required"})
            try:
                header, b64 = image.split(",", 1)
                media = header.split(";")[0].split(":")[1] if ":" in header else "image/jpeg"
                payload = json.dumps({
                    "model": AI_MODEL,
                    "max_tokens": 300,
                    "messages": [{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                        {"type": "text", "text": prompt},
                    ]}],
                }).encode()
                req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=payload, method="POST", headers={
                    "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"})
                with urllib.request.urlopen(req, timeout=40) as resp:
                    j = json.loads(resp.read())
                text = "".join(c.get("text", "") for c in (j.get("content") or [])).strip()
                return self._send(200, {"text": text})
            except Exception as e:
                return self._send(502, {"error": "AI vision upstream error"})

        if u.path == "/push/subscribe":              # browser registers for web-push
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            # Alerts are routed by role, so the role is the caller's own, not one
            # the body names.
            ok = save_pushsub(b.get("subscription"), me["role"])
            return self._send(200 if ok else 400, {"ok": ok})

        if u.path == "/push/test":                   # send a test alert to the caller's role
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            # To the caller's role only: a test from any login used to fire every
            # subscription on the server.
            n = send_push("Garage Saathi", "✅ Test alert — phone notifications are working.", "/", roles=(me["role"],))
            return self._send(200, {"ok": True, "sent": n, "webpush": _WEBPUSH})

        if u.path == "/its/lookup":                  # owner/supervisor: PNRs of untraced reviews -> ITS
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            if me["role"] not in ("owner", "supervisor"):
                return self._send(403, {"error": "forbidden"})
            b = self._body()
            if isinstance(b, dict) and b.get("diag") and me["role"] == "owner":
                return self._send(*its_lookup_diag(b.get("pnrs")))
            code, res = its_lookup_batch((b or {}).get("pnrs") if isinstance(b, dict) else None, me)
            return self._send(code, res)

        if u.path == "/ai/bill":                     # read a supplier bill photo (store/owner/supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            try:
                return self._send(*read_bill(me, str((self._body() or {}).get("photo") or "")))
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/digest":                   # the Monday summary (extension weekly, or the owner now)
            h = self.headers.get("Authorization") or ""
            force = False
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor"):
                    return self._send(403, {"error": "forbidden"})
                force = bool((self._body() or {}).get("now"))     # "Write now" from the app
            try:
                return self._send(*digest_tick(force=force))
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/coaching":                 # draft this week's coaching notes (extension or office)
            h = self.headers.get("Authorization") or ""
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in COACH_DECIDERS:
                    return self._send(403, {"error": "forbidden"})
            try:
                return self._send(*coach_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/coaching/decide":          # approve or skip a note (crew manager / owner / supervisor)
            me = self._auth_user()
            if not me:
                return self._send(401, {"error": "unauthorized"})
            return self._send(*coach_decide(me, self._body()))

        if u.path == "/ai/reports":                  # draft job cards from driver reports (extension or office)
            h = self.headers.get("Authorization") or ""
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor"):
                    return self._send(403, {"error": "forbidden"})
            try:
                return self._send(*report_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/core":                     # look at returned old-part photos (extension or office)
            h = self.headers.get("Authorization") or ""
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor"):
                    return self._send(403, {"error": "forbidden"})
            try:
                return self._send(*core_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/gate":                     # look at gate check photos (extension or office)
            h = self.headers.get("Authorization") or ""
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor"):
                    return self._send(403, {"error": "forbidden"})
            try:
                return self._send(*gate_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/names":                    # match typed redBus names to crew (extension or office)
            h = self.headers.get("Authorization") or ""
            if not (_ai_trigger_ok(h)):
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor", "crewmanager"):
                    return self._send(403, {"error": "forbidden"})
            try:
                return self._send(*names_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/ai/reviews":                  # read new reviews for whose fault (extension or owner)
            h = self.headers.get("Authorization") or ""
            by_token = _ai_trigger_ok(h)
            if not by_token:
                me = self._auth_user()
                if not me:
                    return self._send(401, {"error": "unauthorized"})
                if me["role"] not in ("owner", "supervisor"):
                    return self._send(403, {"error": "forbidden"})
            b = self._body()
            try:
                if isinstance(b, dict) and b.get("diag"):
                    return self._send(*review_ai_diag())
                if isinstance(b, dict) and b.get("retry"):
                    return self._send(*review_ai_retry())
                return self._send(*review_ai_tick())
            except urllib.error.HTTPError as e:
                return self._send(502, {"error": "Claude answered %s" % e.code})
            except Exception as e:
                return self._send(502, {"error": "AI upstream error: %s" % type(e).__name__})

        if u.path == "/redpro/ingest":               # the office collector posts redPro data here
            if not _REDPRO_TOKEN_OK:
                return self._send(503, {"error": "redpro ingest disabled — set REDPRO_INGEST_TOKEN"})
            h = self.headers.get("Authorization") or ""
            if not hmac.compare_digest(h, "Bearer " + REDPRO_INGEST_TOKEN):
                return self._send(401, {"error": "unauthorized"})
            res = ingest_redpro(self._body())
            return self._send(200 if res.get("ok") else 400, res)

        if u.path == "/gps/ingest":                  # GPS provider pushes telemetry here
            if not _GPS_TOKEN_OK:                     # no real token configured → ingest disabled
                return self._send(503, {"error": "gps ingest disabled — set GPS_INGEST_TOKEN"})
            h = self.headers.get("Authorization") or ""
            if h != "Bearer " + GPS_INGEST_TOKEN:
                return self._send(401, {"error": "unauthorized"})
            b = self._body()
            events = b.get("events") if isinstance(b, dict) else None
            if events is None:
                return self._send(400, {"error": "expected {events:[...]}"})
            return self._send(200, ingest_gps(events))

        # Echo the path the process actually received. Behind a platform that
        # rewrites URLs (Vercel routes everything to one function) the request the
        # handler sees is not always the one the client sent, and without this the
        # symptom is an unexplainable 404 on a route that demonstrably exists.
        self._send(404, {"error": "not found", "sawPath": self.path,
                         "sawMethod": self.command})

    def log_message(self, *a):
        pass


# Vercel's Python runtime serves a module-level `BaseHTTPRequestHandler` subclass
# named `handler`. The api/index.py entry re-exports this. On serverless there's
# no long-lived process: schema lives in the shared Turso DB (created already),
# live GPS is re-read per request via _gps_hydrate(), so no startup step is run.
handler = Handler


if __name__ == "__main__":
    try:
        db().close()
    except DatabaseUnavailable as e:
        # Exit non-zero so the platform marks the deploy failed and keeps routing
        # to the previous healthy container, instead of promoting a broken one.
        print("FATAL: " + str(e))
        raise SystemExit(1)
    _record_boot()                   # evidence for /health: did storage survive a restart?
    if not ENABLE_DEMO_SEED:
        print("ENABLE_DEMO_SEED is not 1 → no demo staff accounts; published demo PINs are refused")
    bootstrap()                      # same path serverless takes
    os.makedirs(UPLOADS, exist_ok=True)
    if ALLOWED_ORIGINS == "*":
        print("WARNING: ALLOWED_ORIGIN=* (open CORS). Unset it to lock to the PWA domain before production.")
    else:
        print("CORS locked to: " + ", ".join(ALLOWED_ORIGINS) + " (+ any localhost port for dev)")
    if not _GPS_TOKEN_OK:
        print("NOTE: GPS_INGEST_TOKEN not set (or demo) → /gps/ingest is disabled.")
    print(f"AI advisor proxy: {'ENABLED (/ai)' if ANTHROPIC_API_KEY else 'disabled (set ANTHROPIC_API_KEY)'}")
    print(f"DB: {'Turso (libSQL, persistent)' if _USE_TURSO else DB + ' — local SQLite (EPHEMERAL on Render free; set TURSO_URL+TURSO_AUTH_TOKEN to persist)'}")
    print(f"Garage Saathi sync server on http://0.0.0.0:{PORT}  (uploads: {UPLOADS}/)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

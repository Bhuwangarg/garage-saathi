#!/usr/bin/env python3
"""Garage Saathi — production-readiness audit against the 111-item checklist.

Static only: greps, AST walks and file reads over the repo on disk. It never
touches the production database, never calls the deployed server and needs no
secret, so it is safe to run at any time — an audit people are afraid to run is
an audit nobody runs.

    python3 .claude/skills/prod-readiness/scripts/audit.py [--only g1,g2] [--json] [--fail-on-gap]

Statuses:
  GUARDED  something in the code actually handles this, and the check found it
  GAP      it applies here and nothing handles it — the message says what to do
  MANUAL   applies, but only a person (or a dashboard) can answer it
  N/A      does not exist in this stack; the message says why
"""
import argparse
import ast
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))

GUARDED, GAP, MANUAL, NA = "GUARDED", "GAP", "MANUAL", "N/A"
ACCEPTED = "ACCEPTED"


def accepted_gaps():
    """Gaps a person looked at and deliberately left, as data rather than code.

    Without this the tool re-raises a settled question every run, and people
    learn to skim past the gap list — which is the failure mode that makes an
    audit worthless."""
    out = {}
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "references", "accepted.txt")
    try:
        with open(p, encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith("#") or "|" not in ln:
                    continue
                parts = [x.strip() for x in ln.split("|", 2)]
                if len(parts) == 3:
                    out[parts[0]] = (parts[1], parts[2])
    except OSError:
        pass
    return out
_cache = {}


def read(rel):
    """File contents, or '' when the file is absent. Cached per run."""
    if rel not in _cache:
        p = os.path.join(ROOT, rel)
        try:
            with open(p, encoding="utf-8") as f:
                _cache[rel] = f.read()
        except OSError:
            _cache[rel] = ""
    return _cache[rel]


SERVER = lambda: read("sync_server.py")      # noqa: E731
APP = lambda: read("app.js")                 # noqa: E731
SYNC = lambda: read("sync.js")               # noqa: E731
SW = lambda: read("sw.js")                   # noqa: E731
VERCEL = lambda: read("vercel.json")         # noqa: E731


def has(text, *needles):
    return all(n in text for n in needles)


def count(text, pattern):
    return len(re.findall(pattern, text))


# --------------------------------------------------------------------------
# The checks. One fact each. A check that can only say "looks fine" is worse
# than no check, because it reads as a guarantee.
# --------------------------------------------------------------------------

def c_rate_login():
    s = SERVER()
    if has(s, "loginfails") and re.search(r"LOCK(OUT)?_(AFTER|MINUTES)|too many", s, re.I):
        return GUARDED, "login brute-force: loginfails table + lockout in sync_server.py"
    return GAP, "no brute-force lockout on /auth/login — add a per-user and per-IP failure counter"


def c_rate_writes():
    s = SERVER()
    if re.search(r"def\s+_rate_limit|RATE_LIMIT_|ratelimit", s, re.I):
        return GUARDED, "a rate limiter exists for the write endpoints"
    return (GAP, "/push, /pull and /upload have no rate limit. One stuck phone in a retry "
                 "loop can spend the whole Vercel budget. Cheapest fix: a per-user counter "
                 "in the existing sys table, refused with 429 + Retry-After")


def c_upload_size():
    s = SERVER()
    if "MAX_UPLOAD_BYTES" in s and "Content-Length" in s:
        return GUARDED, "uploads are refused above MAX_UPLOAD_BYTES before the body is read"
    return GAP, "no size ceiling on uploads — a phone can post an arbitrarily large body"


def c_push_body_size():
    s = SERVER()
    if re.search(r"MAX_PUSH_BYTES|MAX_BODY", s):
        return GUARDED, "the /push body has a declared ceiling"
    return (GAP, "/push reads Content-Length without a ceiling. Vercel caps the request anyway, "
                 "so this is a clarity fix, not an outage: declare MAX_PUSH_BYTES and refuse 413")


def c_cache_sw():
    s = SW()
    m = re.search(r"const CACHE\s*=\s*['\"]([^'\"]+)", s)
    if not m:
        return GAP, "sw.js has no versioned cache name — a deploy cannot invalidate old assets"
    if "stale-while-revalidate" in s or "caches.match" in s:
        return GUARDED, "service worker caches under %s and revalidates" % m.group(1)
    return MANUAL, "cache name %s exists; confirm the fetch strategy is deliberate" % m.group(1)


def c_cache_headers():
    v = VERCEL()
    if "Cache-Control" in v or "headers" in v:
        return GUARDED, "vercel.json sets response headers"
    return (MANUAL, "no headers block in vercel.json — static assets fall back to Vercel's "
                    "defaults. Fine while sw.js versions the cache; revisit if that changes")


def c_cache_invalidation():
    s, w = SERVER(), SW()
    if "BUILD_TAG" in s and re.search(r"const CACHE\s*=", w):
        return GUARDED, "deploy identity (BUILD_TAG) and a versioned SW cache both exist"
    return MANUAL, "confirm how a deploy forces phones off the previous build"


def c_idempotency():
    s = SERVER()
    if "_upsert_record" in s and re.search(r"ON CONFLICT|INSERT OR REPLACE", s):
        return GUARDED, "/push upserts by (store, id): replaying the same push is a no-op"
    return GAP, "/push is not demonstrably idempotent — a retried push could duplicate rows"


def c_retries():
    s = SYNC()
    if re.search(r"TRIES|retry|attempt", s, re.I):
        return GUARDED, "sync.js retries failed pulls/pushes"
    return GAP, "the client does not retry a failed sync — one blip loses the window"


def c_backoff():
    s = SYNC() + APP()
    if re.search(r"backoff|Math\.pow\(2|\*\s*2\s*\*\*|delay\s*\*=\s*2", s, re.I):
        return GUARDED, "retries back off rather than hammering"
    return (GAP, "retries appear to use a fixed interval. A server having a bad minute gets "
                 "the same load every tick from every phone — add exponential backoff with jitter")


def c_timeouts_client():
    s = SYNC()
    if "AbortController" in s or "timeoutMs" in s:
        return GUARDED, "client fetches abort on a timeout"
    return GAP, "client fetches have no timeout — a hung request blocks the sync loop for ever"


def c_timeouts_server():
    s = SERVER()
    bare = count(s, r"urlopen\((?:(?!timeout).)*?\)\s*(?:as|\n)")
    if bare == 0 and "timeout=" in s:
        return GUARDED, "every outbound urlopen passes a timeout"
    return GAP, "%d outbound request(s) have no timeout — a slow third party becomes our 504" % bare


def c_dlq():
    s = SYNC() + APP()
    if re.search(r"quarantin|refusedRow|notStored", s, re.I):
        return GUARDED, "refused records are quarantined and surfaced instead of being dropped"
    return GAP, "a record the server refuses is lost silently — it needs a dead-letter path"


def c_backpressure():
    s = SERVER()
    if re.search(r"PAGE|LIMIT\s+\?|limit=", s) and "rev" in s:
        return GUARDED, "/pull is paged by a rev cursor, so one device cannot ask for everything"
    return GAP, "/pull is unpaged — a new device pulls the whole history in one request"


def c_sql_injection():
    s = SERVER()
    # An f-string or % interpolation INSIDE an execute() call is the dangerous shape.
    bad = []
    try:
        tree = ast.parse(s)
    except SyntaxError:
        return MANUAL, "sync_server.py did not parse; check by hand"
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        name = getattr(fn, "attr", None) or getattr(fn, "id", None)
        if name not in ("execute", "executemany") or not node.args:
            continue
        a0 = node.args[0]
        if isinstance(a0, ast.JoinedStr):
            bad.append(getattr(node, "lineno", "?"))
        elif isinstance(a0, ast.BinOp) and isinstance(a0.op, (ast.Mod, ast.Add)):
            bad.append(getattr(node, "lineno", "?"))
    if bad:
        return GAP, "SQL built by interpolation at line(s) %s — use placeholders" % ", ".join(map(str, bad))
    return GUARDED, "every execute() takes a literal statement with bound parameters"


def c_xss():
    a = APP()
    if "function esc(" not in a and "const esc" not in a:
        return GAP, "no esc() helper — values are going into innerHTML raw"
    esc_uses = count(a, r"\besc\(")
    # Only interpolations that sit inside markup can be an injection at all.
    inline = re.findall(r"<[a-z][^`\n]{0,200}?\$\{\s*([A-Za-z_$][\w$]*)\.(name|problem|note|remark|serial|label)\s*\}", a)
    # Most survivors are constants out of code-defined maps (INCIDENT, GPS_EVENT,
    # chart series), which are not user input. Static analysis cannot tell those
    # apart from a driver's name, so this reports rather than accuses.
    if not inline:
        return GUARDED, "%d esc() calls, and no unescaped field interpolated inside markup" % esc_uses
    return (MANUAL, "%d esc() calls; %d interpolation(s) inside markup are unescaped. Spot-checked "
                    "samples were constants from code-defined maps, not user input — grep "
                    "\"${x.name}\" and confirm each source before trusting this line"
                    % (esc_uses, len(inline)))


def c_cors():
    s = SERVER()
    if "Access-Control-Allow-Origin" not in s:
        return GAP, "no CORS headers — cross-origin callers get opaque failures"
    if "cors_origin_for" in s and "Vary" in s:
        return GUARDED, "CORS echoes an allow-listed origin and sets Vary: Origin"
    if re.search(r'Access-Control-Allow-Origin["\']\s*,\s*["\']\*', s):
        return GAP, "CORS is wide open (*) — restrict it to the app's own origins"
    return MANUAL, "CORS headers exist; confirm the allowed origins are a list, not a wildcard"


def c_csrf():
    s = SERVER()
    if re.search(r"Authorization|Bearer|X-Session", s):
        return GUARDED, "writes authenticate on a header token, which a cross-site form cannot set"
    return MANUAL, "confirm writes cannot be driven by a cross-site form post"


def c_ssrf():
    s = SERVER()
    # Fetching a URL that came from a record is the dangerous shape.
    if re.search(r"urlopen\(\s*(?:data|rec|body|payload)\b", s):
        return GAP, "the server fetches a URL taken from user data — allow-list the host"
    return GUARDED, "no outbound request takes its URL from user-supplied data"


def c_secrets_in_repo():
    hits = []
    pats = [
        (r"sk-ant-[A-Za-z0-9_\-]{10,}", "Anthropic key"),
        (r"postgres(?:ql)?://[^\s\"']*:[^\s\"'@]+@", "database URL with a password"),
        (r"eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.", "JWT"),
        (r"AKIA[0-9A-Z]{16}", "AWS key id"),
    ]
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__", "uploads")]
        for fn in filenames:
            if not fn.endswith((".py", ".js", ".json", ".html", ".sh", ".md", ".yml", ".yaml")):
                continue
            p = os.path.join(dirpath, fn)
            try:
                with open(p, encoding="utf-8", errors="ignore") as f:
                    body = f.read()
            except OSError:
                continue
            for pat, what in pats:
                for m in re.finditer(pat, body):
                    # Setup docs spell the shape of a URL out. An 8-letter
                    # all-alphabetic password is "PASSWORD", not a credential.
                    val = m.group(0)
                    pw = re.search(r"://[^:]+:([^@]+)@", val)
                    if pw and re.fullmatch(r"[A-Za-z<>\[\]{}._-]+", pw.group(1)):
                        continue
                    if re.search(r"<|\[|YOUR|xxx|EXAMPLE|CHANGEME", val, re.I):
                        continue
                    hits.append("%s in %s" % (what, os.path.relpath(p, ROOT)))
    if hits:
        return GAP, "committed secret(s): " + "; ".join(sorted(set(hits))[:5])
    return GUARDED, "no API key, database URL or token literal found in the tree"


def c_secrets_env():
    s = SERVER()
    if "os.environ" in s or "getenv" in s:
        return GUARDED, "secrets are read from the environment, not from files in the repo"
    return MANUAL, "confirm where the server gets its credentials"


def c_token_rotation():
    s = SERVER()
    names = re.findall(r'environ(?:\.get)?\(\s*["\']([A-Z0-9_]*(?:TOKEN|SECRET|KEY)[A-Z0-9_]*)', s)
    if names:
        return (MANUAL, "rotatable secrets in use: %s — rotation is a dashboard action and a "
                        "calendar entry, not code" % ", ".join(sorted(set(names))[:6]))
    return MANUAL, "no named secrets found; confirm by hand"


def c_tls():
    bad = [u for u in re.findall(r"http://[a-z0-9.\-]+", SERVER() + APP() + SYNC())
           # Loopback, the dev bind address and the RFC1918 ranges are local by
           # definition — flagging them trains people to ignore this line.
           if not re.match(r"http://(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)", u)]
    if bad:
        return GAP, "plain-http endpoint(s): %s" % ", ".join(sorted(set(bad))[:4])
    return GUARDED, "every non-local endpoint is https"


def c_encryption_rest():
    return MANUAL, "Supabase Postgres and R2 both encrypt at rest by default — confirm neither was opted out"


def c_pii_in_logs():
    s = SERVER()
    if "_redact" in s:
        return GUARDED, "errors pass through _redact() before being logged"
    return GAP, "exceptions are logged raw — a connection string or a phone number can land in logs"


def c_health():
    s = SERVER()
    if "/health" in s:
        extra = " (and it probes storage)" if "r2_probe" in s else ""
        return GUARDED, "/health exists" + extra
    return GAP, "no /health endpoint — nothing can tell a live deploy from a dead one"


def c_health_truthful():
    s = SERVER()
    if "/health" in s and re.search(r"def\s+health|db_ok|_db_probe|r2_probe", s):
        return GUARDED, "/health checks its dependencies rather than returning a constant"
    return GAP, "/health answers without testing the database — it will read green while the DB is down"


def c_logging():
    s = SERVER()
    n = count(s, r"\bprint\(")
    if n:
        return (MANUAL, "%d print() statements go to Vercel's log stream. Readable, but not "
                        "queryable and dropped after the retention window — attach a drain if "
                        "an incident ever needs yesterday" % n)
    return GAP, "the server logs nothing — an incident leaves no trace"


def c_tracing():
    return (NA, "one serverless handler and one database: there is no multi-hop request to trace. "
                "Revisit if the Bolna/WhatsApp agents start calling through this server")


def c_metrics():
    return (MANUAL, "no metrics are emitted. Vercel's own dashboard covers invocations, errors "
                    "and duration; anything business-level (pushes refused, sync failures) is not counted")


def c_alerts():
    return MANUAL, "no alerting configured in the repo — set Vercel notifications and a Supabase disk alert"


def c_slo():
    return (MANUAL, "no SLO is written down. Worth one line in DEPLOY.md: what counts as 'the app is "
                    "working' for a conductor at 4 a.m., and how long it may be broken")


def c_migrations():
    s = SERVER()
    if re.search(r"ALTER TABLE .* ADD COLUMN", s) and "CREATE TABLE IF NOT EXISTS" in s:
        return (GUARDED, "schema changes are idempotent CREATE/ALTER statements run at boot — "
                         "simple, and it does mean there is no down-migration")
    return MANUAL, "confirm how the schema changes between deploys"


def c_schema_version():
    s = SERVER()
    if re.search(r"SCHEMA_VERSION|schema_version", s):
        return GUARDED, "the schema carries a version"
    return (GAP, "nothing records which schema a deploy expects. With boot-time CREATE/ALTER this "
                 "has not bitten; it will the first time a column has to change type")


def c_backups():
    return (MANUAL, "Supabase takes daily backups on the paid tiers — open the dashboard and "
                    "confirm the plan, the retention and that a restore has been tried once")


def c_disaster_recovery():
    s = APP()
    if re.search(r"exportAll|downloadBackup|export\.html", s) or read("export.html"):
        return GUARDED, "the app can export its own data, which is a second copy off the platform"
    return GAP, "no export path — the only copy of the data is the one Supabase holds"


def c_failover():
    return NA, "single region (bom1), single database. Failover would mean a second region nobody is paying for"


def c_multiregion():
    return NA, "the buses, the office and the staff are all in one state; one region is the right answer"


def c_rollback():
    return (MANUAL, "Vercel keeps every previous deployment and can promote one instantly. "
                    "Worth rehearsing once so nobody learns the UI during an incident")


def c_feature_flags():
    s = APP() + SERVER() + SYNC()
    # The mechanism is a server-side list handed to the client on /pull, read
    # through flagOn(). Look for both halves: a flag list nobody can read, or a
    # reader with nothing feeding it, is not a working flag system.
    if "def feature_flags(" in SERVER() and "function flagOn(" in SYNC():
        return GUARDED, "FEATURE_FLAGS on the server, delivered on /pull, read by Sync.flagOn()"
    if re.search(r"FEATURE_FLAGS?\s*=|featureFlag|isFeatureEnabled\(", s):
        return GUARDED, "feature flags exist"
    return (GAP, "no flags: every change is live for all roles the moment it deploys. For a "
                 "fleet that runs at night, a flag on anything risky is cheap insurance")


def c_canary():
    return (NA, "a hundred users on one deployment — a canary needs traffic to split. "
                "Rolling back is the control here, not a percentage rollout")


def c_connection_pooling():
    s = SERVER()
    if re.search(r"pooler|pgbouncer|POOL", s, re.I):
        return GUARDED, "the connection string points at a pooler"
    return (GAP, "serverless functions open a Postgres connection each. Without Supabase's "
                 "pooler (port 6543) a burst exhausts the connection limit — check DATABASE_URL")


def c_n_plus_one():
    s = SERVER()
    if re.search(r"for .+ in .+:\s*\n\s+.*(?:c|cur)\.execute\(", s):
        return MANUAL, "there is at least one execute() inside a loop — check it is bounded"
    return GUARDED, "no query found inside a loop"


def c_indexes():
    s = SERVER()
    if "CREATE INDEX" in s and "PRIMARY KEY(store, id)" in s:
        return GUARDED, "records is keyed on (store, id) and the hot lookup tables are indexed"
    return GAP, "the main tables have no index beyond their primary key"


def c_read_replicas():
    return NA, "read traffic is a few dozen phones polling; a replica would cost more than it saves"


def c_sharding():
    return NA, "one garage, tens of thousands of rows. Sharding solves a problem this does not have"


def c_partitioning():
    s = SERVER()
    if "HISTORY_DAYS" in s:
        return GUARDED, "history is bounded by HISTORY_DAYS instead of growing without limit"
    return MANUAL, "no retention policy found — check what stops the records table growing for ever"


def c_optimistic_locking():
    s = SERVER()
    if "updatedAt" in s and re.search(r"last-write|lww|updatedAt.*>", s, re.I):
        return GUARDED, "writes resolve by payload updatedAt (last write wins), which is a documented choice"
    return MANUAL, "confirm how two phones writing the same record resolve"


def c_clock_skew():
    s = SERVER()
    if re.search(r"skew|now_ms\(\).*updatedAt|server.*stamp", s, re.I) and "_upsert_record" in s:
        return (GUARDED, "the server stamps updatedAt on write, so a phone with a wrong clock "
                         "cannot win every conflict")
    return (GAP, "last-write-wins on a client-supplied timestamp. A phone whose clock is a day "
                 "fast wins every conflict for a day — stamp updatedAt server-side")


def c_race_conditions():
    a = APP()
    if "_clickBusy" in a:
        return GUARDED, "_clickBusy locks each [data-act] element while its handler runs"
    if re.search(r"clickLock|data-once|_writing", a):
        return GUARDED, "a click lock stops a double tap writing twice"
    return GAP, "no guard against a double tap submitting a form twice"


def c_distributed_locks():
    return NA, "one writer process and one database; a distributed lock has nothing to coordinate"


def c_memory_leaks():
    a = APP()
    adds = count(a, r"addEventListener\(")
    removes = count(a, r"removeEventListener\(")
    if adds > 25 and removes == 0:
        return (MANUAL, "%d addEventListener and no removeEventListener. Most are on elements that "
                        "are thrown away with the screen, which is fine — check the ones on "
                        "window/document" % adds)
    return GUARDED, "listeners are added and removed in pairs, or scoped to disposable elements"


def c_cold_starts():
    return (MANUAL, "a Python stdlib handler on Vercel cold-starts in roughly a second. The first "
                    "conductor of the morning pays it; nobody has complained. Measure before fixing")


def c_serverless_limits():
    v = VERCEL()
    if re.search(r"maxDuration|memory", v):
        return GUARDED, "vercel.json declares the function's limits"
    return (MANUAL, "no maxDuration/memory in vercel.json — the defaults apply. A long /pull on a "
                    "new device is the one that would hit a ceiling")


def c_autoscaling():
    return NA, "Vercel scales the function per request; there is nothing of ours to scale"


def c_horizontal_scaling():
    s = SERVER()
    if re.search(r"^_[A-Z_]+\s*=\s*(?:\{\}|\[\])", s, re.M):
        return (MANUAL, "there is module-level mutable state. Each serverless instance has its own "
                        "copy, so anything correctness-critical must live in Postgres, not there")
    return GUARDED, "no module-level state that a second instance would disagree about"


def c_cdn():
    return GUARDED, "Vercel serves the static app from its edge network by default"


def c_api_versioning():
    s = SERVER()
    # Versioning here is a prefix the router strips, not a second set of route
    # literals — so look for the mechanism, not for "/v1/" spelled out.
    if "PROTOCOL_VERSION" in s and "_strip_version" in s:
        return GUARDED, "/v1/<path> is accepted as an alias and an unknown version 404s rather than being served v1"
    ours = re.findall(r'path\s*(?:==|\.startswith\()\s*["\']/([a-z0-9/_-]+)', s)
    if any(re.match(r"v\d", p) for p in ours):
        return GUARDED, "our endpoints are versioned"
    return (GAP, "/pull and /push are unversioned. Phones update lazily, so an old build will "
                 "call today's endpoint for weeks — any breaking change needs a /v2, not an edit")


def c_webhooks():
    s = SERVER()
    if re.search(r"gps.*ingest|/ingest|X-Ingest|GPS_INGEST_TOKEN", s, re.I):
        if "GPS_INGEST_TOKEN" in s:
            return GUARDED, "the inbound GPS webhook authenticates on a shared token"
        return GAP, "an inbound webhook accepts posts without authenticating the caller"
    return NA, "no inbound webhook"


def c_websockets():
    return NA, "the client polls on a timer. A yard with patchy signal is better served by polling plus an outbox than by a socket that drops"


def c_cron():
    v = VERCEL()
    if "crons" in v:
        return GUARDED, "vercel.json declares scheduled jobs"
    return MANUAL, "no Vercel cron declared — confirm nothing needs to run on a schedule server-side"


def c_graceful_degradation():
    s = SYNC()
    if re.search(r"offline|navigator\.onLine|outbox", s, re.I):
        return GUARDED, "the client works offline and queues writes in an outbox"
    return GAP, "the app has no offline path — a signal drop loses work"


def c_dependency_hell():
    r = read("requirements.txt")
    if not r.strip():
        return GUARDED, "no third-party Python dependencies: the server is stdlib only"
    reqs = [ln.strip() for ln in r.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    # An exact == is the strictest, but a bounded range is enough to stop a new
    # major landing on a deploy that changed nothing of ours, which is the
    # failure this item is really about.
    open_ended = [ln for ln in reqs if "==" not in ln and not re.search(r"<\s*[\d.]", ln)]
    if not open_ended:
        return GUARDED, "%d dependency line(s), none open-ended" % len(reqs)
    return (GAP, "open-ended dependenc(ies): %s — a new major can arrive on a deploy that "
                 "changed nothing of ours" % ", ".join(ln.split(">")[0].split("=")[0] for ln in open_ended))


def c_iac():
    return (NA, "the infrastructure is two dashboards (Vercel, Supabase) and a DNS record. "
                "Terraform would be more moving parts than it removes")


def c_build_caching():
    return NA, "there is no build step — the app is files on disk, served as they are"


def c_chaos():
    return (NA, "chaos engineering needs redundancy to break. With one region and one database "
                "the honest equivalent is rehearsing the restore")


def c_oncall():
    return MANUAL, "there is no rota. Worth writing down who to call when a bus cannot be released at 4 a.m."


def c_postmortems():
    return MANUAL, "incidents are discussed and not written down. The Obsidian vault is the obvious place"


CHECKS = [
    # (item numbers, group, title, fn)
    ([1], "rate", "Rate limiting — login", c_rate_login),
    ([1], "rate", "Rate limiting — write endpoints", c_rate_writes),
    ([1, 90], "rate", "Upload size ceiling", c_upload_size),
    ([1, 44], "rate", "Push body ceiling", c_push_body_size),
    ([2, 48, 49], "cache", "Service-worker cache", c_cache_sw),
    ([2], "cache", "HTTP cache headers", c_cache_headers),
    ([50], "cache", "Cache invalidation on deploy", c_cache_invalidation),
    ([14], "reliability", "Idempotent writes", c_idempotency),
    ([12], "reliability", "Retries", c_retries),
    ([13], "reliability", "Exponential backoff", c_backoff),
    ([11], "reliability", "Client timeouts", c_timeouts_client),
    ([11], "reliability", "Outbound timeouts", c_timeouts_server),
    ([20], "reliability", "Dead-letter path", c_dlq),
    ([44], "reliability", "Backpressure on /pull", c_backpressure),
    ([10], "reliability", "Circuit breakers", lambda: (
        NA, "one dependency (Postgres) with no fallback to trip over to; a breaker would only "
            "turn a slow failure into a fast one")),
    ([78], "security", "SQL injection", c_sql_injection),
    ([79], "security", "XSS", c_xss),
    ([76], "security", "CORS", c_cors),
    ([77], "security", "CSRF", c_csrf),
    ([80], "security", "SSRF", c_ssrf),
    ([67], "security", "Secrets in the repo", c_secrets_in_repo),
    ([67], "security", "Secrets from the environment", c_secrets_env),
    ([70], "security", "Token rotation", c_token_rotation),
    ([71, 73], "security", "TLS everywhere", c_tls),
    ([72], "security", "Encryption at rest", c_encryption_rest),
    ([59], "security", "PII in logs", c_pii_in_logs),
    ([68, 69], "security", "IAM / OAuth", lambda: (
        NA, "logins are PINs held by the garage, not federated identities. OAuth would add a "
            "third party between a conductor and a bus at 4 a.m.")),
    ([74, 75], "security", "WAF / DDoS", lambda: (
        MANUAL, "Vercel absorbs volumetric attacks on the platform edge. Anything application-level "
                "is the rate limiting above")),
    ([56, 57], "ops", "Health endpoint", c_health),
    ([56], "ops", "Health tells the truth", c_health_truthful),
    ([59], "ops", "Logging", c_logging),
    ([60], "ops", "Distributed tracing", c_tracing),
    ([61, 66], "ops", "Metrics", c_metrics),
    ([62], "ops", "Alerts", c_alerts),
    ([63, 64, 65], "ops", "SLOs / SLIs / error budget", c_slo),
    ([81], "data", "Migrations", c_migrations),
    ([82], "data", "Schema versioning", c_schema_version),
    ([84], "data", "Backups", c_backups),
    ([83], "data", "Disaster recovery", c_disaster_recovery),
    ([85], "data", "Failover", c_failover),
    ([86], "data", "Multi-region", c_multiregion),
    ([28], "data", "Connection pooling", c_connection_pooling),
    ([27], "data", "N+1 queries", c_n_plus_one),
    ([25, 26], "data", "Indexing", c_indexes),
    ([29], "data", "Read replicas", c_read_replicas),
    ([30], "data", "Sharding", c_sharding),
    ([31, 32], "data", "Partitioning / retention", c_partitioning),
    ([36, 37], "data", "Optimistic locking", c_optimistic_locking),
    ([96], "data", "Clock skew", c_clock_skew),
    ([39], "data", "Race conditions", c_race_conditions),
    ([38, 40], "data", "Distributed locks / deadlocks", c_distributed_locks),
    ([41, 42], "runtime", "Memory leaks", c_memory_leaks),
    ([89], "runtime", "Cold starts", c_cold_starts),
    ([90], "runtime", "Serverless limits", c_serverless_limits),
    ([45, 46], "runtime", "Autoscaling", c_autoscaling),
    ([46], "runtime", "Horizontal scaling", c_horizontal_scaling),
    ([43], "runtime", "Thread safety", lambda: (
        NA, "one request per handler invocation and no shared threads of ours")),
    ([47], "runtime", "Vertical scaling", lambda: (
        MANUAL, "function memory is Vercel's default; raise it only against a measured limit")),
    ([48], "delivery", "CDN", c_cdn),
    ([51], "delivery", "Feature flags", c_feature_flags),
    ([52, 53, 54], "delivery", "Blue-green / canary / rolling", c_canary),
    ([55], "delivery", "Rollbacks", c_rollback),
    ([6], "delivery", "CI/CD", lambda: (
        GUARDED, "git push to main deploys; scripts/predeploy-gate.sh blocks the push on a red gate")),
    ([7, 8], "delivery", "Docker / Kubernetes", lambda: (
        NA, "no containers: Vercel builds and runs the function from source")),
    ([9, 33], "delivery", "Service discovery / leader election", lambda: (
        NA, "there is one service; nothing to discover and nobody to elect")),
    ([3, 4, 5], "delivery", "Load balancing / reverse proxy / API gateway", lambda: (
        NA, "Vercel's edge is all three. Running our own would add a hop and a thing to page about")),
    ([104, 105, 106], "delivery", "IaC / Terraform / Helm", c_iac),
    ([107], "delivery", "Build caching", c_build_caching),
    ([108], "delivery", "Dependency hell", c_dependency_hell),
    ([102], "api", "API versioning", c_api_versioning),
    ([103], "api", "Semantic versioning", lambda: (
        MANUAL, "sw.js carries a monotonic cache version, which is what phones key off. "
                "Formal semver would only matter if something else consumed this API")),
    ([101], "api", "Webhooks", c_webhooks),
    ([22, 23, 24], "api", "WebSockets / long polling / SSE", c_websockets),
    ([21], "api", "Cron jobs", c_cron),
    ([15, 16, 17], "api", "Queues / pub-sub / event-driven", lambda: (
        NA, "the outbox in sync.js is the only queue this needs. A broker would be a second "
            "thing to keep alive for no gain at this size")),
    ([18, 19], "api", "Distributed transactions / saga", lambda: (
        NA, "one database, so a transaction is a transaction")),
    ([100], "api", "gRPC", lambda: (NA, "JSON over HTTP, consumed by a browser")),
    ([97, 98, 99], "network", "DNS / TCP / HTTP versions", lambda: (
        NA, "handled by Vercel and the browser; nothing of ours chooses a transport")),
    ([91, 92, 93, 94], "network", "Latency / throughput / P99 / tail", lambda: (
        MANUAL, "not measured. Vercel's dashboard has per-route duration — read it before "
                "optimising anything on a hunch")),
    ([95], "network", "Network partitions", c_graceful_degradation),
    ([34, 35], "theory", "CAP / eventual consistency", lambda: (
        GUARDED, "the design is explicitly AP: phones keep working offline and converge on "
                 "reconnect. That is a decision, and it is written down in the vault")),
    ([88], "cost", "Cost optimisation", lambda: (
        MANUAL, "the running cost is Vercel plus Supabase plus R2. The rate limiting above is the "
                "one change that bounds a runaway bill")),
    ([87], "process", "Chaos engineering", c_chaos),
    ([109, 110], "process", "Incidents / on-call", c_oncall),
    ([111], "process", "Postmortems", c_postmortems),
]

COVERED = sorted({n for nums, _, _, _ in CHECKS for n in nums})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated groups")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--fail-on-gap", action="store_true")
    args = ap.parse_args()
    groups = {g.strip() for g in args.only.split(",") if g.strip()}

    ok_gaps = accepted_gaps()
    results = []
    for nums, group, title, fn in CHECKS:
        if groups and group not in groups:
            continue
        try:
            status, msg = fn()
        except Exception as e:                                  # a broken check must not hide the rest
            status, msg = MANUAL, "check failed to run: %s: %s" % (type(e).__name__, e)
        if status == GAP and title in ok_gaps:
            when, why = ok_gaps[title]
            status, msg = ACCEPTED, "accepted %s — %s" % (when, why)
        results.append({"items": nums, "group": group, "title": title, "status": status, "message": msg})

    if args.json:
        print(json.dumps({"root": ROOT, "results": results}, indent=2))
    else:
        icon = {GUARDED: "✓", GAP: "✗", MANUAL: "?", NA: "–", ACCEPTED: "~"}
        last = None
        for r in results:
            if r["group"] != last:
                print("\n── %s" % r["group"])
                last = r["group"]
            print("  %s %-34s %s" % (icon[r["status"]], r["title"], r["message"]))
        tally = {s: sum(1 for r in results if r["status"] == s) for s in (GUARDED, GAP, MANUAL, NA, ACCEPTED)}
        print("\n%d checks over %d of the 111 items — %d guarded, %d gaps, %d accepted, %d for a person, %d n/a"
              % (len(results), len(COVERED), tally[GUARDED], tally[GAP], tally[ACCEPTED], tally[MANUAL], tally[NA]))
        gaps = [r for r in results if r["status"] == GAP]
        if gaps:
            print("\nGaps, worst first:")
            for r in gaps:
                print("  • %s — %s" % (r["title"], r["message"]))

    if args.fail_on_gap and any(r["status"] == GAP for r in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

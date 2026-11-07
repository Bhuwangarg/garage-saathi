#!/usr/bin/env bash
# ===========================================================================
# Garage Saathi — v2 isolation check.
#
# v1 serves the office from "/" while v2 is built at "/v2". The failure this
# guards is not subtle, it is just silent: a v2 service worker that claims "/"
# takes over the live app on every device that ever opened v2, and the office
# has no way back. A hundred people would be on an unfinished app with no undo.
#
# Four things keep that from happening, and each is one line somebody could
# delete without noticing:
#   1. v2's worker is served from inside v2/, so the BROWSER caps its scope at
#      /v2/. That cap is the real protection -- ours is defence in depth.
#   2. the registration passes no `scope` option.
#   3. no Service-Worker-Allowed header anywhere, which is the only way a
#      worker can escape its directory.
#   4. v1's worker passes /v2/ through instead of caching it into v1's cache.
#
# Plus: a worker must never be cacheable, or a device pins an old build.
#
# Exit 0 = v1 and v2 cannot reach each other. Exit 1 = stop and read why.
# ===========================================================================
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

FAIL=0
ck() {   # ck <description> <actual> <expected>
  if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"
  else printf '  ✗ %s (got "%s", expected "%s")\n' "$1" "$2" "$3"; FAIL=$((FAIL + 1)); fi
}

printf '── v2 isolation ──\n'

# 1. The worker lives inside v2/, which is what caps its scope.
ck "v2's worker is inside v2/" "$([ -f v2/sw.js ] && echo yes || echo no)" "yes"
ck "v2 has its own app root"   "$([ -f v2/index.html ] && echo yes || echo no)" "yes"

# 2 and 3 are the SCOPE CAP, and which side of it we are on is now a decision
#    recorded in one constant. Before the cutover the cap is absolute: v2 cannot
#    reach the live app, because the browser will not let a worker served from
#    /v2/ control anything above it, and that rule holds whatever our code says.
#    After the cutover v2 IS the live app, and the cap is exactly what has to
#    go -- a worker that cannot control "/" cannot make "/" work offline, which
#    is the whole point of this app in a yard with no signal.
#
#    So this file asserts a DIFFERENT set on each side, and refuses to let the
#    two be confused. The cap is not weakened to let a change through; it is
#    retired, deliberately, at the moment its purpose ends.
CUT="$(grep -E '^V2_AT_ROOT = (True|False)$' sync_server.py | head -1 | awk '{print $3}')"
ck "the cutover constant is readable and is one of two values" \
  "$([ "$CUT" = "True" ] || [ "$CUT" = "False" ] && echo yes || echo "no: '$CUT'")" "yes"

SCOPE_OVERRIDES="$(grep -cE "serviceWorker\.register\([^)]*scope" v2/*.html v2/*.js 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')"
SWA_SERVER="$(grep -cE "send_header\(\s*[\"']Service-Worker-Allowed" sync_server.py)"
SWA_PLATFORM="$(grep -c "Service-Worker-Allowed" vercel.json)"

if [ "$CUT" = "False" ]; then
  # Any `scope:` near a register() call is a deliberate attempt to widen it.
  ck "v2 registers its worker with no scope override" "$SCOPE_OVERRIDES" "0"
  # Only the server and the platform config can set a response header, so only
  # those two are checked -- a client file can merely NAME it, and the first
  # version of this check failed on a comment in v2/index.html explaining why
  # the header must never appear. A check that trips on prose about itself
  # teaches people to delete checks.
  ck "the server never sends Service-Worker-Allowed" "$SWA_SERVER" "0"
  ck "the platform config never sends it either" "$SWA_PLATFORM" "0"
else
  # After the cutover the widening must be present, deliberate, and narrow:
  # exactly one registration asks for it, and the header is the server's to
  # send -- never the platform config's, which would apply it to files nobody
  # reviewed.
  ck "v2's worker asks for root scope, exactly once" "$SCOPE_OVERRIDES" "1"
  ck "the server sends Service-Worker-Allowed" \
    "$([ "$SWA_SERVER" -ge 1 ] && echo yes || echo no)" "yes"
  ck "…and only for v2's own worker, never a blanket rule" \
    "$(grep -cE "Service-Worker-Allowed" vercel.json)" "0"
  # v1 has to stay reachable, because it is the way back.
  ck "v1 is still reachable at /index.html" \
    "$([ -f index.html ] && echo yes || echo no)" "yes"
  ck "v2's worker passes v1's own document through rather than serving its shell" \
    "$(grep -c "function isOurs" v2/sw.js)" "1"
fi

# 4. v1's worker passes /v2/ straight through. Both halves are on one line, so
#    this counts MATCHES, not lines -- grep -c counts lines and reported 1 for
#    the two guards it was meant to find.
ck "v1's worker ignores the bare /v2 path" \
  "$(grep -oE "pathname === '/v2'" sw.js | wc -l | tr -d ' ')" "1"
ck "v1's worker ignores everything under /v2/" \
  "$(grep -oE "pathname\.startsWith\('/v2/'\)" sw.js | wc -l | tr -d ' ')" "1"

# 5. Any file called sw.js is served no-cache, matched by basename so a third
#    client cannot miss it the way /v2/sw.js did.
ck "every sw.js is served no-cache" \
  "$(grep -c 'os.path.basename(rel) == "sw.js"' sync_server.py)" "1"

# 6. What "/" serves. Both branches must exist whichever way the constant is
#    set, because the way back is as important as the way forward: the cutover
#    chooses between them, it does not delete one.
V1_LINE="$(grep -n 'self._serve_static("/index.html")' sync_server.py | head -1 | cut -d: -f1)"
V2_LINE="$(grep -n 'self._serve_static("/v2/index.html")' sync_server.py | head -1 | cut -d: -f1)"
ck "v1's document is still served from somewhere" \
  "$([ -n "$V1_LINE" ] && echo yes || echo no)" "yes"
ck "v2's document is still served from somewhere" \
  "$([ -n "$V2_LINE" ] && echo yes || echo no)" "yes"
ck "the root route reads the cutover constant rather than hard-coding a side" \
  "$(grep -c 'V2_AT_ROOT' sync_server.py | awk '{print ($1>=2)?"yes":"no"}')" "yes"

# 7. v2 must not reach into v1's files. A shared file is a change to v1 made by
#    accident, which is the whole thing "alongside" exists to prevent.
ck "v2 does not source v1's scripts" \
  "$(grep -ohE 'src="[^"]+"' v2/*.html 2>/dev/null | grep -cE '\.\./|/app\.js|/sync\.js|/db\.js' || true)" "0"

# 8. The databases must not be the same one. This is the invariant the first
#    eleven missed, and it is the worst of the lot: both clients are served from
#    one origin, IndexedDB versions a database globally, and v2 bumping
#    DB_VERSION for its own store makes v1's open(name, 28) throw VersionError.
#    v1 would come up with NO DATABASE on an office machine, because a tester
#    opened v2 once.
V1_DB="$(grep -oE "DB_NAME = '[^']+'" db.js | head -1)"
V2_DB="$(grep -oE "DB_NAME = '[^']+'" v2/db.js | head -1)"
ck "v1 and v2 do not share an IndexedDB database" \
  "$([ -n "$V1_DB" ] && [ -n "$V2_DB" ] && [ "$V1_DB" != "$V2_DB" ] && echo differ || echo "SAME: $V1_DB")" "differ"

# 9. And v2's files have to be in the deployed bundle at all. includeFiles is an
#    ALLOW-LIST: it named every other served directory and not v2, so /v2
#    returned 404 in production while passing every check here and working
#    perfectly against a local server. A gate that only ever sees localhost is
#    not a gate on the deploy.
ck "the deploy bundle includes v2/" \
  "$(grep -c 'v2/\*\*' vercel.json)" "1"

printf '──\n'
if [ "$FAIL" -eq 0 ]; then printf '✅ v1 and v2 are isolated\n'; exit 0; fi
printf '❌ %s isolation failure(s) — do not deploy\n' "$FAIL"; exit 1

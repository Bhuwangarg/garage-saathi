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

# 2. No scope override in v2's registration. Any `scope:` near a register() call
#    is a deliberate attempt to widen it.
ck "v2 registers its worker with no scope override" \
  "$(grep -cE "serviceWorker\.register\([^)]*scope" v2/*.html v2/*.js 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')" "0"

# 3. The header that would let a worker escape its directory must not exist.
#    Only the server and the platform config can set a response header, so only
#    those two are checked -- a client file can merely NAME it, and the first
#    version of this check failed on a comment in v2/index.html explaining why
#    the header must never appear. A check that trips on prose about itself
#    teaches people to delete checks.
ck "the server never sends Service-Worker-Allowed" \
  "$(grep -cE "send_header\(\s*[\"']Service-Worker-Allowed" sync_server.py)" "0"
ck "the platform config never sends it either" \
  "$(grep -c "Service-Worker-Allowed" vercel.json)" "0"

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

# 6. "/" must still be v1. The v2 route is a separate branch that comes after
#    it; the cutover is editing the FIRST of these, which is why their order
#    matters more than their presence.
V1_LINE="$(grep -n 'self._serve_static("/index.html")' sync_server.py | head -1 | cut -d: -f1)"
V2_LINE="$(grep -n 'self._serve_static("/v2/index.html")' sync_server.py | head -1 | cut -d: -f1)"
ck "\"/\" is still served by v1" "$([ -n "$V1_LINE" ] && echo yes || echo no)" "yes"
ck "the /v2 route comes after it" \
  "$([ -n "$V1_LINE" ] && [ -n "$V2_LINE" ] && [ "$V2_LINE" -gt "$V1_LINE" ] && echo yes || echo no)" "yes"

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

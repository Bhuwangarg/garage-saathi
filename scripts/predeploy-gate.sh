#!/usr/bin/env bash
# ===========================================================================
# Garage Saathi — pre-deploy gate (deterministic, no LLM).
#
# Runs a fast gstack smoke + regression suite against a local serve and blocks
# the push if a critical flow breaks. This is the deterministic guard that runs
# in the git pre-push hook; the richer, exploratory QA is the agent-driven
# /g-saathi skill (run that manually/periodically).
#
# Covers, for the deploy-critical paths:
#   1. Login works for all 5 roles (owner/supervisor/store/mechanic/driver).
#   2. Stock-count REGRESSION: the count fields don't navigate away on tap, and
#      a Full count actually persists (audits +1) + closes the sheet.
#   3. Invariant: form controls never trigger navigation (the bug class that
#      shipped once — a nav attr leaking onto an <input>).
#
# Exit 0 = pass (allow push). Exit 1 = fail (block). Bypass: git push --no-verify.
# If gstack isn't installed, the gate warns and ALLOWS the push (best-effort).
# ===========================================================================
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Use a fresh origin each run so a stale service-worker / HTTP cache from a prior
# run can never serve an old build — the gate must test the code on disk.
PORT="${GS_GATE_PORT:-$(( 8800 + ($$ % 120) ))}"
URL="http://localhost:$PORT/index.html"

# Locate the gstack browse binary (repo-local first, then user home).
B=""
for c in "$REPO/.claude/skills/gstack/browse/dist/browse" "$HOME/.claude/skills/gstack/browse/dist/browse"; do
  [ -x "$c" ] && B="$c" && break
done
if [ -z "$B" ]; then
  echo "⚠️  g-saathi gate: gstack browse binary not found — skipping (install gstack to enable). Push allowed."
  exit 0
fi

# Cheap parse check before spinning up a browser.
if command -v node >/dev/null 2>&1; then
  node --check "$REPO/app.js" || { echo "❌ g-saathi gate: app.js failed syntax check"; exit 1; }
fi

# Serve the app.
python3 -m http.server "$PORT" --directory "$REPO" >/dev/null 2>&1 &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null; }
trap cleanup EXIT
sleep 1

PASS=0; FAIL=0
j()  { "$B" js "$1" 2>/dev/null; }
ck() { # desc, actual, expected
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  ✗ %s (got "%s", expected "%s")\n' "$1" "$2" "$3"; fi
}
login() { # role userid d1 d2 d3 d4
  "$B" goto "$URL" >/dev/null 2>&1; sleep 2
  "$B" click "[data-role=$1]" >/dev/null 2>&1; sleep 1
  "$B" click "[data-login=$2]" >/dev/null 2>&1; sleep 1
  for d in $3 $4 $5 $6; do "$B" click "[data-k=\"$d\"]" >/dev/null 2>&1; done; sleep 2
}

echo "── g-saathi pre-deploy gate ──"
# Warm up the gstack daemon (first call boots it, ~3s).
"$B" goto "$URL" >/dev/null 2>&1; sleep 4
# Belt-and-suspenders: nuke any service-worker registration + caches for this
# origin, then hard-reload, so we never grade a previously-cached build.
"$B" js "(async()=>{try{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(function(r){return r.unregister();}));var ks=await caches.keys();await Promise.all(ks.map(function(k){return caches.delete(k);}));}catch(e){}})();'cleared'" >/dev/null 2>&1; sleep 2
"$B" goto "$URL" >/dev/null 2>&1; sleep 3

# 1) Login smoke for every role.
login owner      u-owner 1 1 1 1; ck "owner login"      "$(j "S.user?S.user.role:'none'")" "owner"
login supervisor u-sup   2 2 2 2; ck "supervisor login" "$(j "S.user?S.user.role:'none'")" "supervisor"
login store      u-store 3 3 3 3; ck "store login"      "$(j "S.user?S.user.role:'none'")" "store"
login mechanic   u-m1    0 0 0 1; ck "mechanic login"   "$(j "S.user?S.user.role:'none'")" "mechanic"
login driver     u-d1    0 0 1 0; ck "driver login"     "$(j "S.user?S.user.role:'none'")" "driver"

# 2) Stock-count regression + persistence (the bug that shipped) — as store.
login store u-store 3 3 3 3
"$B" js "document.querySelector('[data-act=openStoreHealth]')?.click()" >/dev/null 2>&1; sleep 1
"$B" js "document.querySelector('[data-act=auditFull]')?.click()"       >/dev/null 2>&1; sleep 1
ck "full-count sheet opens"                  "$(j "!!document.querySelector('.au-count')")" "true"
# Clicking a count field must NOT navigate away (the exact regression).
j "var f=document.querySelector('.au-count'); f&&f.dispatchEvent(new MouseEvent('click',{bubbles:true}));'x'" >/dev/null
ck "tapping count field does not navigate"   "$(j "S.route.name")" "storehealth"
ck "sheet still open after field tap"        "$(j "!!document.querySelector('.sheetwrap')")" "true"
# Enter counts + submit -> a new audit must persist.
BEFORE="$(j "(S.cache.audits||[]).length")"
j "var n=0;document.querySelectorAll('.au-count').forEach(function(i){i.value=String(3+(n++));i.dispatchEvent(new Event('input',{bubbles:true}));});'set'" >/dev/null
"$B" js "document.querySelector('[data-act=saveAudit]')?.click()" >/dev/null 2>&1; sleep 2
AFTER="$(j "(S.cache.audits||[]).length")"
ck "stock count persists (audits grew)"      "$([ "${AFTER:-0}" -gt "${BEFORE:-0}" ] && echo yes || echo no)" "yes"
ck "sheet closes after save"                 "$(j "!document.querySelector('.sheetwrap')")" "true"

# 3) Invariant sweep: form controls never navigate (owner's main tabs).
login owner u-owner 1 1 1 1
for SCREEN in home jobs store me; do
  j "navTab('$SCREEN')" >/dev/null; sleep 1
  RES="$(j "var r=S.route.name;Array.from(document.querySelectorAll('input,select,textarea')).forEach(function(e){e.dispatchEvent(new MouseEvent('click',{bubbles:true}));});S.route.name===r?'stable':'MOVED'")"
  ck "owner/$SCREEN: form controls don't navigate" "$RES" "stable"
done

echo "──"
echo "RESULT: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  echo "❌ g-saathi gate FAILED — fix the above, or bypass with: git push --no-verify"
  exit 1
fi
echo "✅ g-saathi gate passed — deploy allowed"
exit 0

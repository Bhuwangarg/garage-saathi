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
#   1. Login works for every role that HAS a login (owner/supervisor/store/driver),
#      and mechanics — who no longer sign in — are absent from the picker.
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
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO" >/dev/null 2>&1 &
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
# Wait for a condition instead of guessing at it with sleep. Fixed sleeps made
# this gate flaky: login is async (it tries the network first and only then falls
# back to the device PIN), so a busy machine finished the sleep before the login
# landed and the assertion read the PREVIOUS test's user — which is why failures
# looked like "supervisor login got owner" and moved around between runs.
settle() { # js-expression, expected, tries
  local i=0
  while [ "$i" -lt "${3:-25}" ]; do
    [ "$(j "$1")" = "$2" ] && return 0
    i=$((i+1)); sleep 0.4
  done
  return 1
}
login() { # role userid d1 d2 d3 d4
  # Two attempts. The gate serves the app from a static server with no
  # /auth/login, so the PIN is validated against the device credential the app
  # seeds on first load — and occasionally the pad is ready fractionally before
  # that seed is. One clean retry costs a second and removes the last flake.
  _login_once "$@" && return 0
  _login_once "$@"
}
_login_once() { # role userid d1 d2 d3 d4
  "$B" goto "$URL" >/dev/null 2>&1
  # Wait for the tile itself, not merely for S.user to clear: during a reload
  # S is briefly undefined while the OLD screen is still painted, so "no user
  # yet" would fire before the login screen exists and the click would hit
  # nothing — leaving the previous test's session in place.
  settle "document.querySelector('[data-role=$1]')?'yes':'no'" "yes" 30 >/dev/null
  "$B" click "[data-role=$1]" >/dev/null 2>&1
  settle "document.querySelector('[data-login=$2]')?'yes':'no'" "yes" 15 >/dev/null
  "$B" click "[data-login=$2]" >/dev/null 2>&1
  settle "document.querySelector('[data-k=\"1\"]')?'yes':'no'" "yes" 15 >/dev/null
  for d in $3 $4 $5 $6; do "$B" click "[data-k=\"$d\"]" >/dev/null 2>&1; done
  # Generous on purpose: Sync.login tries the network first and only falls back
  # to the device PIN when that aborts, which takes up to 12s on its own. A wait
  # of the same length was landing exactly on that boundary.
  settle "S.user?S.user.role:'none'" "$1" 70 >/dev/null
  [ "$(j "S.user?S.user.role:'none'")" = "$1" ]
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
login driver     u-d1    0 0 1 0; ck "driver login"     "$(j "S.user?S.user.role:'none'")" "driver"
# Mechanics sign in again (2026-09-11, reversing the earlier removal) — but to
# SEE their assigned work, not to keep the card. The supervisor still writes it.
# So the assertion moved: the door is open, and what is behind it is limited.
login mechanic u-m1 0 0 0 1; ck "mechanic login" "$(j "S.user?S.user.role:'none'")" "mechanic"
# A mechanic sees only their own work. Anything else here is a leak of another
# mechanic's jobs, and of the whole board to somebody with no business on it.
ck "mechanic sees only their own jobs" \
  "$(j "(function(){var n=(S.cache.jobs||[]).filter(function(x){return !isOnJob(x,S.user.id)});var shown=[].slice.call(document.querySelectorAll('[data-job]')).map(function(e){return e.getAttribute('data-job')});return n.filter(function(x){return shown.indexOf(x.id)>=0}).length})()")" "0"
# Closing is the supervisor's and the owner's. The button must not be there...
ck "mechanic has no close button" \
  "$(j "(function(){var j=(S.cache.jobs||[]).filter(function(x){return x.assignedTo===S.user.id&&(x.status==='open'||x.status==='in-progress')})[0];if(!j)return 'nojob';route({name:'jobs',id:j.id});return document.querySelector('[data-act=markDone]')?'yes':'no'})()")" "no"
# ...and they are still assignable people: the scorecard and pilferage radar are
# built on knowing who did the work.
ck "mechanics still on the roster" \
  "$(j "(S.cache.users||[]).filter(function(u){return u.role==='mechanic'}).length>0")" "true"

# 2) Stock-count regression + persistence (the bug that shipped) — as store.
login store u-store 3 3 3 3
# Same fixed-sleep trap the login steps had: one second is not enough to render
# the store screen on a loaded machine, so the click landed on nothing and the
# sheet assertions failed for reasons that had nothing to do with the sheet.
settle "document.querySelector('[data-act=openStoreHealth]')?'yes':'no'" "yes" 25 >/dev/null
"$B" js "document.querySelector('[data-act=openStoreHealth]')?.click()" >/dev/null 2>&1
settle "document.querySelector('[data-act=auditFull]')?'yes':'no'" "yes" 25 >/dev/null
"$B" js "document.querySelector('[data-act=auditFull]')?.click()"       >/dev/null 2>&1
settle "document.querySelector('.au-count')?'yes':'no'" "yes" 25 >/dev/null
ck "full-count sheet opens"                  "$(j "!!document.querySelector('.au-count')")" "true"
# Clicking a count field must NOT navigate away (the exact regression).
j "var f=document.querySelector('.au-count'); f&&f.dispatchEvent(new MouseEvent('click',{bubbles:true}));'x'" >/dev/null
ck "tapping count field does not navigate"   "$(j "S.route.name")" "storehealth"
ck "sheet still open after field tap"        "$(j "!!document.querySelector('.sheetwrap')")" "true"
# Enter counts + submit -> a new audit must persist.
BEFORE="$(j "(S.cache.audits||[]).length")"
j "var n=0;document.querySelectorAll('.au-count').forEach(function(i){i.value=String(3+(n++));i.dispatchEvent(new Event('input',{bubbles:true}));});'set'" >/dev/null
"$B" js "document.querySelector('[data-act=saveAudit]')?.click()" >/dev/null 2>&1
# The save is async (IndexedDB write, then reload); wait for the sheet to go
# rather than guessing at two seconds.
settle "document.querySelector('.sheetwrap')?'open':'closed'" "closed" 25 >/dev/null
AFTER="$(j "(S.cache.audits||[]).length")"
ck "stock count persists (audits grew)"      "$([ "${AFTER:-0}" -gt "${BEFORE:-0}" ] && echo yes || echo no)" "yes"
ck "sheet closes after save"                 "$(j "!document.querySelector('.sheetwrap')")" "true"

# 2b) Completed work & preventive tracking.
login owner u-owner 1 1 1 1
# The classifier decides which past jobs count as "the same thing again", so a
# wrong answer here invents a repeat that never happened — or hides a real one.
# These two were live bugs: "AC not cooling" fell through to 'other' because a
# bare two-letter word never appears inside a longer phrase, and "track rod"
# matched AC once that was loosened to a substring.
ck "classifier: AC not cooling"   "$(j "jobSystem({problem:'AC not cooling again'})")" "ac"
ck "classifier: brakes plural"    "$(j "jobSystem({problem:'Brakes feel weak'})")" "brakes"
ck "classifier: Hindi brake"      "$(j "jobSystem({problem:'ब्रेक से आवाज'})")" "brakes"
ck "classifier: gas charged"      "$(j "jobSystem({problem:'A/C gas charged'})")" "ac"
ck "classifier: track rod is not AC" "$(j "jobSystem({problem:'Track rod end'})")" "other"
ck "classifier: trim is not AC"   "$(j "jobSystem({problem:'Trim panel loose'})")" "other"
# Unclassified jobs share a bucket, not a cause: two of them must never read as
# the same fault coming back.
ck "unclassified work is never flagged as a repeat" \
  "$(j "(function(){var D=86400000,n=Date.now(),b=S.cache.buses[0].id,o=S.cache.jobs;S.cache.jobs=o.concat([{id:'gx1',busId:b,problem:'Seat cover stitching',status:'verified',completeAt:n-30*D,createdAt:n-30*D,partsUsed:[]},{id:'gx2',busId:b,problem:'Body denting',status:'verified',completeAt:n-3*D,createdAt:n-3*D,partsUsed:[]}]);var t=serviceTracking(b).filter(function(x){return x.sys==='other'})[0];S.cache.jobs=o;return t&&(t.quickRepeat||t.due)?'FLAGGED':'clean'})()")" "clean"
j "route({name:'history'})" >/dev/null
settle "S.route.name" "history" 20 >/dev/null
ck "completed-work screen renders"  "$(j "document.querySelector('#hist-list')?'yes':'no'")" "yes"
# A mechanic's finished cards are their own and nobody else's — the same scope
# their live board has. Widening it here would be a back door onto the fleet.
login mechanic u-m1 0 0 0 1
j "route({name:'history'})" >/dev/null
settle "S.route.name" "history" 20 >/dev/null
ck "mechanic history is only their own work" \
  "$(j "completedJobs().filter(function(x){return x.assignedTo!==S.user.id}).length")" "0"

# 2c) The topbar carries no permanent sync badge, and a batch of writes is ONE push.
login supervisor u-sup 2 2 2 2
ck "no sync chip in the topbar while healthy" \
  "$(j "document.querySelectorAll('.topbar .syncchip').length")" "0"
# A dead session used to raise a mark and a popup telling him to go and fix it
# in Me -> Sync. It renews itself now, with the PIN this device already holds,
# so there is nothing to act on and nothing to show. Forcing the status directly
# is the only way to reach that state without killing a real session.
ck "a dead session raises no mark — it renews itself" \
  "$(j "(function(){var was=SYNC_STATUS;SYNC_STATUS='signedout';updateSyncChip();var n=document.querySelectorAll('.topbar .syncchip').length;SYNC_STATUS=was;updateSyncChip();return n})()")" "0"
ck "no sync mark in any state" \
  "$(j "document.querySelectorAll('.topbar .syncchip').length")" "0"
# ...and the chore is gone with it: nothing anywhere offers to sync by hand.
ck "no manual sync control on Me" \
  "$(j "(function(){route({name:'me'});return /syncNow|Sync now/.test(document.querySelector('#app .content').innerHTML)?'yes':'no'})()")" "no"
# push() used to send one HTTP request per record. Twelve writes must cost one.
# The gate serves from a static server with no /push, so this counts what the
# app ATTEMPTED, which is exactly the property under test.
j "performance.clearResourceTimings()" >/dev/null
j "(async function(){for(var i=0;i<12;i++){await DB.put('parts',{id:'gate-b'+i,name:'gate batch '+i,qty:1,unitCost:1,unit:'pc',reorderLevel:1,category:'T',updatedAt:Date.now()});}})()" >/dev/null
settle "(Sync.info().pending>=12)?'yes':'no'" "yes" 20 >/dev/null
sleep 3
PUSHES="$(j "performance.getEntriesByType('resource').filter(function(r){return /\/push/.test(r.name)}).length")"
ck "12 queued writes cost at most one push request" "$([ "${PUSHES:-9}" -le 1 ] && echo yes || echo no)" "yes"

# 2d) Outside-job gate pass: the identifiers are a SNAPSHOT, and the serial is checked.
login supervisor u-sup 2 2 2 2
j "route({name:'outsidejobs'})" >/dev/null
settle "S.route.name" "outsidejobs" 20 >/dev/null
ck "outside-job screen renders" "$(j "document.querySelector('#gp-list')?'yes':'no'")" "yes"
# The pass is a DOCUMENT: what it prints comes off the record, not off a live
# lookup of the bus. Correcting a bus record next month must not silently
# rewrite the slip sitting in the vendor's file. Rendered here with an engineNo
# that deliberately disagrees with the bus, so a live lookup would show through.
j "(async function(){var b=S.cache.buses[0];await DB.put('gatepasses',{id:'gt-snap',no:'OJ-SNAP',status:'out',vendorName:'V',busId:b.id,regNo:b.regNo,engineNo:'FROM-PASS',chassisNo:b.chassis,unitName:'Alt',unitSerial:'S-1',issuedBy:'u-sup',issuedAt:Date.now(),updatedAt:Date.now()});await load();route({name:'gatepass',id:'gt-snap'})})()" >/dev/null
settle "S.route.name" "gatepass" 25 >/dev/null
ck "the slip prints what was recorded, not a live lookup" \
  "$(j "/FROM-PASS/.test(document.querySelector('.gp-sheet').innerText)")" "true"
ck "and the bus's own engine no. does not show through" \
  "$(j "document.querySelector('.gp-sheet').innerText.indexOf(S.cache.buses[0].engine)")" "-1"

# Punctuation must not cry wolf, and a real swap must not slip through.
ck "serial compare ignores punctuation"  "$(j "gpNormSerial(' alt 77219 b ')===gpNormSerial('ALT-77219-B')")" "true"
ck "serial compare still catches a swap" "$(j "gpNormSerial('ST-9999')===gpNormSerial('ST-4410')")" "false"
# A gate pass printed from a phone in dark mode has to come out readable.
ck "the slip stays ink-on-paper in dark mode" \
  "$(j "(function(){var d=document.documentElement.getAttribute('data-theme');document.documentElement.setAttribute('data-theme','dark');var el=document.createElement('div');el.className='gp-sheet';document.body.appendChild(el);var c=getComputedStyle(el).backgroundColor;el.remove();if(d)document.documentElement.setAttribute('data-theme',d);else document.documentElement.removeAttribute('data-theme');return c})()")" "rgb(255, 255, 255)"

# 2e) Every parts chooser is a search box, not a 2,391-option dropdown.
login store u-store 3 3 3 3
j "sheetReceive()" >/dev/null
settle "document.getElementById('pps-rcv')?'y':'n'" "y" 20 >/dev/null
ck "receive stock has a part search"   "$(j "document.getElementById('pps-rcv')?'y':'n'")" "y"
ck "receive stock has no part dropdown" "$(j "document.querySelectorAll('.sheetwrap select#f-part').length")" "0"
j "closeSheet();sheetAddStock()" >/dev/null
settle "document.getElementById('pps-stk')?'y':'n'" "y" 20 >/dev/null
ck "add stock has a part search"       "$(j "document.getElementById('pps-stk')?'y':'n'")" "y"
ck "add stock has no part dropdown"    "$(j "document.querySelectorAll('.sheetwrap select#f-spart').length")" "0"
# A bill has repeating part lines. Each needs its OWN picker, or two lines share
# a key and picking in one silently rewrites the other.
j "closeSheet();sheetAddPurchase()" >/dev/null
settle "document.querySelectorAll('.f-line').length>0?'y':'n'" "y" 20 >/dev/null
j "document.getElementById('f-addline').click()" >/dev/null
settle "String(document.querySelectorAll('.f-line').length)" "2" 20 >/dev/null
ck "each bill line gets its own picker" \
  "$(j "(function(){var k=[].slice.call(document.querySelectorAll('.f-line [data-pp]')).map(function(e){return e.getAttribute('data-pp')});return String(new Set(k).size===k.length&&k.length===2)})()")" "true"
# savePurchase() reads row.querySelector('.f-lpart').value — the hidden input
# must keep that class or every bill line silently saves an empty part.
ck "bill line read-back still resolves" "$(j "document.querySelectorAll('.f-line .f-lpart').length")" "2"
# Issuing defaults to what is actually on the shelf; restocking must not, because
# the part being restocked is usually the one at zero.
j "closeSheet();sheetIssue()" >/dev/null
settle "document.getElementById('pps-iss')?'y':'n'" "y" 20 >/dev/null
ck "issue defaults to in-stock parts only" \
  "$(j "String([].slice.call(document.querySelectorAll('#ppl-iss .li')).every(function(n){return !/Out of stock/.test(n.textContent)}))")" "true"
j "closeSheet()" >/dev/null

# 2f) Registrations match however they are written, and the de-dupe keeps the real bus.
login owner u-owner 1 1 1 1
# AirFi sends the official zero-padded plate; 15 buses in the fleet list are not.
ck "MP44ZD471 matches the tracker's MP44ZD0471" "$(j "_normReg('MP44ZD471')===_normReg('MP44ZD0471')")" "true"
ck "spacing and case still ignored"           "$(j "_normReg('mp44 zd 471')")" "MP44ZD0471"
# No series letter means the district/number boundary is ambiguous: never guess.
ck "an ambiguous plate is left as written"    "$(j "_normReg('RJ14123')")" "RJ14123"
# The padding makes a real bus and an AirFi-imported copy of it the same group,
# which turns the background de-dupe on for them. Every real bus scored 0 there,
# the same as the copy, so a tie could have deleted the real one.
j "window.__g='';(async function(){var n=Date.now();await DB.put('buses',{id:'g-ph',regNo:'QQ44ZD0471',source:'airfi',docs:[],createdAt:n});await DB.put('buses',{id:'g-real',regNo:'QQ44ZD471',source:'route-import',docs:[],createdAt:n-9e8});await DB.put('jobcards',{id:'g-job',busId:'g-real',problem:'x',status:'open',createdAt:n,updatedAt:n});await load();await cleanupFleet(true);window.__g=(byId(S.cache.buses,'g-real')?'kept':'LOST')+'/'+(byId(S.cache.buses,'g-ph')?'phantom-stays':'phantom-gone');})().catch(function(e){window.__g='ERR'})" >/dev/null
settle "window.__g||''" "kept/phantom-gone" 30 >/dev/null
ck "de-dupe keeps the real bus, drops the import" "$(j "window.__g")" "kept/phantom-gone"

# 2g) Several mechanics on one job: each sees it, nobody else does.
login supervisor u-sup 2 2 2 2
j "window.__cs='';(async function(){var b=S.cache.buses[0],n=Date.now();await DB.put('jobcards',{id:'g-crew',busId:b.id,problem:'Gate crew job',status:'open',priority:'medium',createdAt:n,updatedAt:n,assignedTo:'u-m1',assignees:[{userId:'u-m1',task:'Electrical'},{userId:'u-m2',task:'Brakes'}],partsUsed:[],beforePhotos:[],afterPhotos:[]});await load();window.__cs='ok'})()" >/dev/null
settle "window.__cs||''" "ok" 25 >/dev/null
# assignedTo stays the first mechanic, so every older reader still sees a name.
ck "shared job keeps assignedTo as the lead"  "$(j "byId(S.cache.jobs,'g-crew').assignedTo")" "u-m1"
ck "both mechanics are on the crew"           "$(j "jobCrew(byId(S.cache.jobs,'g-crew')).map(function(a){return a.userId}).join(',')")" "u-m1,u-m2"
# A job saved by the previous build has no assignees array at all.
ck "an old single-mechanic job still reads"   "$(j "jobCrew({assignedTo:'u-m3'}).length")" "1"
ck "a draft saved as a bare id still restores" "$(j "parseCrew('u-m3')[0].userId")" "u-m3"
# The second mechanic — not assignedTo — must still get the job.
login mechanic u-m2 0 0 0 2
ck "second mechanic login" "$(j "S.user?S.user.id:'none'")" "u-m2"
j "route({name:'jobs'})" >/dev/null
settle "S.route.name" "jobs" 20 >/dev/null
ck "the second mechanic sees the shared job" "$(j "document.querySelector('[data-job=\"g-crew\"]')?'yes':'no'")" "yes"
j "route({name:'jobs',id:'g-crew'})" >/dev/null
settle "S.route.id||''" "g-crew" 20 >/dev/null
ck "and can open it" "$(j "String(/Gate crew job/.test(document.querySelector('.content').innerText))")" "true"
# A mechanic on neither side of it must not reach it, by list or by link.
login mechanic u-m3 0 0 0 3
j "route({name:'jobs'})" >/dev/null
settle "S.route.name" "jobs" 20 >/dev/null
ck "a mechanic not on it does not see it" "$(j "document.querySelector('[data-job=\"g-crew\"]')?'LEAK':'hidden'")" "hidden"
j "route({name:'jobs',id:'g-crew'})" >/dev/null
sleep 1
ck "and a deep link does not open it" "$(j "String(/Gate crew job/.test(document.querySelector('.content').innerText))")" "false"

# 2h) Challans: an old lookup made with the zero dropped is not trusted if it found nothing.
login owner u-owner 1 1 1 1
ck "challan lookup asks for the official plate" "$(j "normReg('MP44ZD471')")" "MP44ZD0471"
ck "an empty old snapshot is treated as unchecked" \
  "$(j "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'MP44ZD471',total:0,pendingCount:0,pendingFine:0}];_chSnapFrom=null;var r=challanFor('MP44ZD471')?'TRUSTED':'unchecked';S.cache.challans=s;_chSnapFrom=null;return r})()")" "unchecked"
ck "an old snapshot that FOUND challans is kept" \
  "$(j "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'NL07B585',total:3,pendingCount:2,pendingFine:1000}];_chSnapFrom=null;var c=challanFor('NL07B585');S.cache.challans=s;_chSnapFrom=null;return c?String(c.pendingFine):'LOST'})()")" "1000"
# Old and fresh snapshot for one bus must not add that bus's fines twice.
ck "fines are counted once per bus" \
  "$(j "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'RJ14PF207',total:2,pendingCount:2,pendingFine:500,fetchedAt:1},{rc:'RJ14PF0207',total:2,pendingCount:1,pendingFine:200,fetchedAt:2}];_chSnapFrom=null;var f=fleetChallanTotals().fine;S.cache.challans=s;_chSnapFrom=null;return String(f)})()")" "200"
# Ids are names that already exist: they keep the stored spelling.
ck "record ids keep the stored spelling"   "$(j "_regIdKey('MP44 ZD 471')")" "MP44ZD471"

# 2i) The supervisor's own work signs itself off; the owner's does not.
ck "supervisor closes = signed off"        "$(j "String(selfSignsOff('supervisor'))")" "true"
ck "owner still needs a second person"     "$(j "String(selfSignsOff('owner'))")" "false"
login supervisor u-sup 2 2 2 2
j "window.__sv='';(async function(){var b=S.cache.buses[0],n=Date.now();await DB.put('jobcards',{id:'g-sv',busId:b.id,problem:'Gate supervisor close',status:'open',priority:'low',createdAt:n,updatedAt:n,assignedTo:'u-m1',beforePhotos:['b'],afterPhotos:['a'],partsUsed:[]});await load();await markDone('g-sv');var j=byId(S.cache.jobs,'g-sv');window.__sv=j.status+'/'+j.verifiedBy+'/'+j.closedBy})().catch(function(e){window.__sv='ERR '+e.message})" >/dev/null
settle "window.__sv||''" "verified/u-sup/u-sup" 30 >/dev/null
ck "a supervisor's close is verified in the same step" "$(j "window.__sv")" "verified/u-sup/u-sup"

# 3) Invariant sweep: form controls never navigate (owner's main tabs).
login owner u-owner 1 1 1 1
for SCREEN in home jobs store me; do
  j "navTab('$SCREEN')" >/dev/null
  settle "S.route.name" "$SCREEN" 20 >/dev/null
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

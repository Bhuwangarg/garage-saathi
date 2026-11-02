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

# One gate at a time per browser. The gstack daemon is ONE headless browser
# with ONE tab per repo, so two gates running together (a push from one
# session while another session pushes or reruns the gate) take turns driving
# the same tab: one's goto lands mid-way through the other's login, and both
# read each other's user. Seen 17 Oct as "supervisor login (got none)" and a
# deleted card returning its parts twice. Wait for the other run instead.
# Pin the daemon to this repo, so the lock and the browser are the same scope
# whatever directory the gate is started from (the CLI otherwise picks its
# daemon from the caller's cwd).
export BROWSE_STATE_FILE="$REPO/.gstack/browse.json"
mkdir -p "$REPO/.gstack"
LOCK="$REPO/.gstack/gate.lock"
HAVE_LOCK=0
_waited=0
until mkdir "$LOCK" 2>/dev/null; do
  _holder="$(cat "$LOCK/pid" 2>/dev/null)"
  # A holder that died without cleaning up (kill -9, a closed laptop) must not
  # block every push after it. No pid yet is a run that is just starting —
  # unless the lock has sat like that for a minute.
  if { [ -n "$_holder" ] && ! kill -0 "$_holder" 2>/dev/null; } ||
     { [ -z "$_holder" ] && [ $(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null || date +%s) )) -gt 60 ]; }; then
    rm -rf "$LOCK"; continue
  fi
  # The /g-saathi QA skill takes this same lock (its bin/lock), and says so.
  _who="$(cat "$LOCK/who" 2>/dev/null || echo "another gate run")"
  [ "$_waited" -eq 0 ] && echo "… the test browser is in use by $_who (pid ${_holder:-?}) — waiting for it to finish"
  _waited=$((_waited+1))
  if [ "$_waited" -gt 900 ]; then echo "❌ g-saathi gate: still locked by $_who (pid ${_holder:-?}) after 15 min ($LOCK)"; exit 1; fi
  sleep 1
done
HAVE_LOCK=1
echo "$$" > "$LOCK/pid"
echo "pre-deploy gate, started $(date '+%d %b %H:%M')" > "$LOCK/who"

# Serve the app.
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO" >/dev/null 2>&1 &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null; [ "$HAVE_LOCK" -eq 1 ] && rm -rf "$LOCK"; }
trap cleanup EXIT
# Interrupted (Ctrl-C, a killed push) still has to free the lock and the port.
trap 'exit 130' INT TERM
sleep 1

PASS=0; FAIL=0
# No single browser call may wedge the gate. `browse js` waits on a promise handed
# back to it with no timeout of its own, and one hung call held a push open for
# fourteen minutes with nothing printed to say where it had stopped. macOS ships no
# timeout(1); perl's alarm survives exec, which is the portable way to bound this.
# A timed-out call returns empty, which reads as a failed check -- loud, and in the
# right place.
j()  { perl -e 'alarm shift; exec @ARGV' 25 "$B" js "$1" 2>/dev/null; }
# A check hands its JS to jck/jck2. It is never written inline as "$(j "...")",
# and the scan below fails the gate if it ever is again.
#
# The reason is a bash 3.2 rule that is very easy to meet by accident: brace
# expansion runs over a word's LITERAL TEXT before the command substitution inside
# it is recognised. So this word --
#   "$(j "componentLife({kind:'tyre',state:'in-service'}).basis")"
# -- is split on the comma FIRST, into two words. Each then runs j on its own with
# JS that nobody wrote (componentLife(kind:'tyre').basis), and ck is handed four
# arguments instead of three: $2 and $3 are two identical junk results compared
# against each other, so the check PASSES while testing nothing whatsoever.
# 26 checks were written that way and had never once executed -- the first of them
# being "mechanic sees only their own jobs", which is a data-isolation check. 31
# more had braces with no comma in them yet, and were one edit away from joining
# them silently. That is why the inline form is banned outright rather than fixed
# case by case.
#
# Passing the expression as an ARGUMENT is the fix: its braces then sit in a word
# that holds no command substitution, and brace expansion leaves such a word alone.
# An assignment's right-hand side and a single-quoted string are safe for the same
# reason, which is why gck() further down takes its expression single-quoted, and
# why the few FOO="$(j "...")" assignments here are left as they are.
jck()  { ck "$1" "$(j "$2")" "$3"; }          # desc, expression, expected literal
jck2() { ck "$1" "$(j "$2")" "$(j "$3")"; }   # desc, expression, expression for expected
ck() { # desc, actual, expected
  # Anything other than three arguments is the signature of the bug above, so it
  # fails -- unconditionally. This used to be opt-in behind GS_GATE_STRICT, which is
  # exactly how 26 dead checks sat inside a green gate: a switch that turns off a
  # correctness check is a switch that stays off.
  if [ "$#" -ne 3 ]; then FAIL=$((FAIL+1)); printf '  ✗ %s (ck was called with %s arguments, not 3)\n' "${1:-?}" "$#"; return; fi
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

# ── the gate's own shape ──────────────────────────────────────────────────
# Two checks on this file, run before anything needs the browser, because the
# failure they guard against is invisible at runtime: a vacuous check prints a
# tick like any other. See the long note at jck() for the mechanism.
echo "── gate self-check ──"

# A braced expression must never be handed to j inline as a command argument.
# Allowed: an assignment's right-hand side, which bash does not brace-expand, and
# an expression with no braces to expand. Anything else is counted, and one is
# enough to fail. A comment is skipped -- the note at jck() shows the broken form
# on purpose, and a gate that reds on its own prose is a gate people switch off.
# The perl is single-quoted, so its own braces are untouchable.
ck "no check hands braced JS to j inline" \
  "$(perl -0777 -ne 'my $n=0; while (/"\$\(j "(.*?)"\)"/gs) { my ($e,$p)=($1,$-[0]); my $ls=rindex($_,"\n",$p)+1; my $pre=substr($_,$ls,$p-$ls); next if $pre =~ /^\s*#/; next if $pre =~ /^\s*[A-Za-z_][A-Za-z0-9_]*=$/; next if $e !~ /\{/; $n++ } print $n' "$0")" "0"

# ...and prove the helper actually delivers such an expression whole, so the ban
# above is not merely cosmetic. A stub stands in for the browser: this asserts the
# shell's behaviour, which is what was broken, not the app's.
_stub_j() { printf 'ARGC=%s|%s' "$#" "$1"; }
_SELF_EXPR="(function(){var o={id:'x',problem:'Seat cover stitching',status:'verified'};return o.problem})()"
ck "jck hands braced JS to the browser as one intact argument" \
  "$(_stub_j "$_SELF_EXPR")" "ARGC=1|$_SELF_EXPR"
# Start from an EMPTY origin, not merely a fresh build. The port above is only
# one of 120, and the gstack daemon is one browser per repo that lives across
# runs, so a later run lands on an origin an earlier one already used — with
# its IndexedDB and localStorage still in it. That was the "98 passed, 7
# failed" flake: the rerun found the last run's deleted g-del card and its
# extra 480100 fuel fill, and 2j/2k timed out waiting for numbers that could
# no longer come out. Clearing the service worker and caches alone (as this
# used to) left all of that in place.
#
# Wiped from a page the app does not run on (a 404 on this origin), so nothing
# holds the database open and the delete is not blocked. Twice: the first pass
# unregisters a stale service worker, the second runs with it gone.
BLANK="http://localhost:$PORT/__gate_blank__"
WIPE="window.__wipe='';(async function(){try{var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(function(r){return r.unregister()}));var ks=await caches.keys();await Promise.all(ks.map(function(k){return caches.delete(k)}));localStorage.clear();sessionStorage.clear();var ds=await indexedDB.databases();await Promise.all(ds.map(function(d){return new Promise(function(ok,no){var q=indexedDB.deleteDatabase(d.name);q.onsuccess=ok;q.onerror=no;q.onblocked=function(){no(new Error('blocked: '+d.name))}})}));window.__wipe='done'}catch(e){window.__wipe='ERR '+e.message}})();'x'"
# Warm up the gstack daemon (first call boots it, ~3s).
"$B" goto "$BLANK" >/dev/null 2>&1; sleep 4
for _pass in 1 2; do
  "$B" goto "$BLANK" >/dev/null 2>&1
  j "$WIPE" >/dev/null
  settle "window.__wipe||''" "done" 25 >/dev/null
done
j "window.__clean='';(async function(){var d=(await indexedDB.databases()).length,r=(await navigator.serviceWorker.getRegistrations()).length,c=(await caches.keys()).length;window.__clean=[d,localStorage.length,r,c].join('/')})();'x'" >/dev/null
settle "window.__clean||''" "0/0/0/0" 25 >/dev/null
CLEAN="$(j "window.__clean||''")"
if [ "$CLEAN" != "0/0/0/0" ]; then
  echo "❌ g-saathi gate: could not empty the test origin (idb/ls/sw/caches = ${CLEAN:-?}; wipe: $(j "window.__wipe||''")) — refusing to grade on a previous run's data"
  exit 1
fi
"$B" goto "$URL" >/dev/null 2>&1; sleep 3

# The one load in this run that is genuinely COLD -- the origin was just proved
# empty above, so this page creates the IndexedDB schema and seeds the roster from
# nothing, exactly as a new phone or an incognito window does.
#
# Taken HERE on purpose. The budget check used to read window.__padAt wherever it
# happened to run, which by then was several logins and several navigations later,
# on a warm database -- so it passed at 72ms while a cold boot was the thing anyone
# would complain about. A budget measured on the easy case is not a budget.
COLD_PAD="$(j "String(window.__padAt==null?-1:window.__padAt)")"
COLD_MARKS="$(j "(window.__bootMarks||[]).join(' ')")"
echo "    (cold boot: ${COLD_MARKS:-no marks})"

# 1) Login smoke for every role.
login owner      u-owner 1 1 1 1; jck "owner login"      "S.user?S.user.role:'none'" "owner"
login supervisor u-sup   2 2 2 2; jck "supervisor login" "S.user?S.user.role:'none'" "supervisor"
login store      u-store 3 3 3 3; jck "store login"      "S.user?S.user.role:'none'" "store"
login driver     u-d1    0 0 1 0; jck "driver login"     "S.user?S.user.role:'none'" "driver"
# Mechanics sign in again (2026-09-11, reversing the earlier removal) — but to
# SEE their assigned work, not to keep the card. The supervisor still writes it.
# So the assertion moved: the door is open, and what is behind it is limited.
login mechanic u-m1 0 0 0 1; jck "mechanic login" "S.user?S.user.role:'none'" "mechanic"
# A mechanic sees only their own work. Anything else here is a leak of another
# mechanic's jobs, and of the whole board to somebody with no business on it.
jck "mechanic sees only their own jobs" \
  "(function(){var n=(S.cache.jobs||[]).filter(function(x){return !isOnJob(x,S.user.id)});var shown=[].slice.call(document.querySelectorAll('[data-job]')).map(function(e){return e.getAttribute('data-job')});return n.filter(function(x){return shown.indexOf(x.id)>=0}).length})()" "0"
# A mechanic must actually REACH their own card. This went unnoticed for a
# while because the close-button check below passed vacuously: viewJobs was not
# in the mechanic's permissions, every tap bounced to home, and home has no
# close button either. Assert the screen first, then what is on it.
# Both halves of the next check fall back to 'nojob', so with no job on this
# mechanic they would agree with each other and it would pass having tested
# nothing. Count the jobs first -- the gate's own rule, applied here.
jck "the mechanic has a job to open at all" \
  "String((S.cache.jobs||[]).filter(function(x){return isOnJob(x,S.user.id)}).length>0)" "true"
jck2 "mechanic can open their own job card" \
  "(function(){var j=(S.cache.jobs||[]).filter(function(x){return isOnJob(x,S.user.id)})[0];if(!j)return 'nojob';route({name:'jobs',id:j.id});return S.route.name+':'+(S.route.id||'')})()" \
  "(function(){var j=(S.cache.jobs||[]).filter(function(x){return isOnJob(x,S.user.id)})[0];return j?'jobs:'+j.id:'nojob'})()"
jck "mechanic can open the store" \
  "(function(){route({name:'store'});return S.route.name})()" "store"
# Closing is the supervisor's and the owner's. The button must not be there...
# The first run of this check, once it could run at all, returned 'nojob': it
# asked for a job that was x.assignedTo AND open/in-progress, and this mechanic's
# only job is verified -- so it never reached the assertion it is named for. It now
# takes the job they are crew on (jobCrew, which is what app.js says to ask), puts
# it in-progress for the length of the assertion and puts the status back.
# That makes it a real tripwire: 'mine' is true, so editable is true, and the only
# thing left withholding the button is mayCloseJob(). Drop that guard and this reds.
jck "mechanic has no close button" \
  "(function(){var u=S.user.id;var j=(S.cache.jobs||[]).filter(function(x){return isOnJob(x,u)})[0];if(!j)return 'nojob';var was=j.status;j.status='in-progress';route({name:'jobs',id:j.id});var r=S.route.name!=='jobs'?'bounced':document.querySelector('[data-act=markDone]')?'yes':'no';j.status=was;return r})()" "no"
# ...and they are still assignable people: the scorecard and pilferage radar are
# built on knowing who did the work.
# The PIN pad's own budget. boot() used to draw it LAST -- after the bundled fleet,
# three migrations, a history prune and a full read of all forty object stores --
# so a cold device showed a blank screen for all of it, and nothing here measured
# that because the app worked fine once it appeared. It is drawn on the roster alone
# now, with the rest of boot behind it.
ck "the PIN pad is drawn promptly on a COLD boot, not after the whole of boot" \
  "$([ "${COLD_PAD:--1}" -ge 0 ] 2>/dev/null && [ "${COLD_PAD:-99999}" -lt 2000 ] 2>/dev/null && echo ok || echo "slow-or-missing:${COLD_PAD:-?}")" "ok"
# The marks are what made the cold number findable at all, after three rounds of
# optimising the wrong layer. If they disappear, the next person is guessing again.
# Computed into a variable first. Written inline as "$(case "$X" in ...)" the inner
# quotes close the outer ones under bash 3.2 and the space-separated marks split
# into eleven arguments -- the same shape as the 26 checks that passed for years
# without running. An assignment's right-hand side is never word-split.
MARKS_OK=missing
case "${COLD_MARKS:-}" in *padDrawn=*) MARKS_OK=ok ;; esac
ck "the boot records where its time went" "$MARKS_OK" "ok"

jck "mechanics still on the roster" \
  "(S.cache.users||[]).filter(function(u){return u.role==='mechanic'}).length>0" "true"

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
jck "full-count sheet opens"                  "!!document.querySelector('.au-count')" "true"
# Clicking a count field must NOT navigate away (the exact regression).
j "var f=document.querySelector('.au-count'); f&&f.dispatchEvent(new MouseEvent('click',{bubbles:true}));'x'" >/dev/null
jck "tapping count field does not navigate"   "S.route.name" "storehealth"
jck "sheet still open after field tap"        "!!document.querySelector('.sheetwrap')" "true"
# Enter counts + submit -> a new audit must persist.
BEFORE="$(j "(S.cache.audits||[]).length")"
j "var n=0;document.querySelectorAll('.au-count').forEach(function(i){i.value=String(3+(n++));i.dispatchEvent(new Event('input',{bubbles:true}));});'set'" >/dev/null
"$B" js "document.querySelector('[data-act=saveAudit]')?.click()" >/dev/null 2>&1
# The save is async (IndexedDB write, then reload); wait for the sheet to go
# rather than guessing at two seconds.
settle "document.querySelector('.sheetwrap')?'open':'closed'" "closed" 25 >/dev/null
AFTER="$(j "(S.cache.audits||[]).length")"
ck "stock count persists (audits grew)"      "$([ "${AFTER:-0}" -gt "${BEFORE:-0}" ] && echo yes || echo no)" "yes"
jck "sheet closes after save"                 "!document.querySelector('.sheetwrap')" "true"

# 2b) Completed work & preventive tracking.
login owner u-owner 1 1 1 1
# The classifier decides which past jobs count as "the same thing again", so a
# wrong answer here invents a repeat that never happened — or hides a real one.
# These two were live bugs: "AC not cooling" fell through to 'other' because a
# bare two-letter word never appears inside a longer phrase, and "track rod"
# matched AC once that was loosened to a substring.
jck "classifier: AC not cooling"   "jobSystem({problem:'AC not cooling again'})" "ac"
jck "classifier: brakes plural"    "jobSystem({problem:'Brakes feel weak'})" "brakes"
jck "classifier: Hindi brake"      "jobSystem({problem:'ब्रेक से आवाज'})" "brakes"
jck "classifier: gas charged"      "jobSystem({problem:'A/C gas charged'})" "ac"
jck "classifier: track rod is not AC" "jobSystem({problem:'Track rod end'})" "other"
jck "classifier: trim is not AC"   "jobSystem({problem:'Trim panel loose'})" "other"
# Unclassified jobs share a bucket, not a cause: two of them must never read as
# the same fault coming back.
jck "unclassified work is never flagged as a repeat" \
  "(function(){var D=86400000,n=Date.now(),b=S.cache.buses[0].id,o=S.cache.jobs;S.cache.jobs=o.concat([{id:'gx1',busId:b,problem:'Seat cover stitching',status:'verified',completeAt:n-30*D,createdAt:n-30*D,partsUsed:[]},{id:'gx2',busId:b,problem:'Body denting',status:'verified',completeAt:n-3*D,createdAt:n-3*D,partsUsed:[]}]);var t=serviceTracking(b).filter(function(x){return x.sys==='other'})[0];S.cache.jobs=o;return t&&(t.quickRepeat||t.due)?'FLAGGED':'clean'})()" "clean"
j "route({name:'history'})" >/dev/null
settle "S.route.name" "history" 20 >/dev/null
jck "completed-work screen renders"  "document.querySelector('#hist-list')?'yes':'no'" "yes"
# A mechanic's finished cards are their own and nobody else's — the same scope
# their live board has. Widening it here would be a back door onto the fleet.
login mechanic u-m1 0 0 0 1
j "route({name:'history'})" >/dev/null
settle "S.route.name" "history" 20 >/dev/null
# This check used to filter on x.assignedTo, and could not fail either way: the
# fixture holds exactly one finished job and it is this mechanic's, so there was
# never another mechanic's work for it to catch leaking. Proved by deleting the
# mechanic scope from completedJobs() -- the check stayed green. So it brings its
# own evidence now, two finished cards that are removed again straight after:
#   gz-other  belongs to u-m2 alone        -> must NOT appear
#   gz-second belongs to u-m2 AND to me    -> MUST appear
# which is the whole assignedTo-versus-jobCrew question in one assertion. Its
# assignedTo is u-m2 in both cases, so reading membership from that field hides
# gz-second ("MISSING"), and dropping the scope entirely exposes gz-other ("LEAK").
jck "mechanic history is their own work, including jobs they are second trade on" \
  "(function(){var o=S.cache.jobs,u=S.user.id,b=S.cache.buses[0].id,n=Date.now();S.cache.jobs=o.concat([{id:'gz-other',busId:b,problem:'p',status:'verified',assignedTo:'u-m2',assignees:[{userId:'u-m2',task:''}],updatedAt:n},{id:'gz-second',busId:b,problem:'p',status:'verified',assignedTo:'u-m2',assignees:[{userId:'u-m2',task:''},{userId:u,task:''}],updatedAt:n}]);var ids=completedJobs().map(function(x){return x.id});S.cache.jobs=o;return (ids.indexOf('gz-other')<0?'hidden':'LEAK')+'/'+(ids.indexOf('gz-second')>=0?'mine':'MISSING')})()" "hidden/mine"
# ...and the door stays open: the route now carries a permission (2q), which
# must not take a mechanic's own finished work away from them.
jck "the mechanic still reaches completed work" "S.route.name" "history"

# 2c) The topbar carries no permanent sync badge, and a batch of writes is ONE push.
login supervisor u-sup 2 2 2 2
jck "no sync chip in the topbar while healthy" \
  "document.querySelectorAll('.topbar .syncchip').length" "0"
# A dead session used to raise a mark and a popup telling him to go and fix it
# in Me -> Sync. It renews itself now, with the PIN this device already holds,
# so there is nothing to act on and nothing to show. Forcing the status directly
# is the only way to reach that state without killing a real session.
jck "a dead session raises no mark — it renews itself" \
  "(function(){var was=SYNC_STATUS;SYNC_STATUS='signedout';updateSyncChip();var n=document.querySelectorAll('.topbar .syncchip').length;SYNC_STATUS=was;updateSyncChip();return n})()" "0"
jck "no sync mark in any state" \
  "document.querySelectorAll('.topbar .syncchip').length" "0"
# ...and the chore is gone with it: nothing anywhere offers to sync by hand.
jck "no manual sync control on Me" \
  "(function(){route({name:'me'});return /syncNow|Sync now/.test(document.querySelector('#app .content').innerHTML)?'yes':'no'})()" "no"
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
jck "outside-job screen renders" "document.querySelector('#gp-list')?'yes':'no'" "yes"
# The pass is a DOCUMENT: what it prints comes off the record, not off a live
# lookup of the bus. Correcting a bus record next month must not silently
# rewrite the slip sitting in the vendor's file. Rendered here with an engineNo
# that deliberately disagrees with the bus, so a live lookup would show through.
j "(async function(){var b=S.cache.buses[0];await DB.put('gatepasses',{id:'gt-snap',no:'OJ-SNAP',status:'out',vendorName:'V',busId:b.id,regNo:b.regNo,engineNo:'FROM-PASS',chassisNo:b.chassis,unitName:'Alt',unitSerial:'S-1',issuedBy:'u-sup',issuedAt:Date.now(),updatedAt:Date.now()});await load();route({name:'gatepass',id:'gt-snap'})})()" >/dev/null
settle "S.route.name" "gatepass" 25 >/dev/null
jck "the slip prints what was recorded, not a live lookup" \
  "/FROM-PASS/.test(document.querySelector('.gp-sheet').innerText)" "true"
jck "and the bus's own engine no. does not show through" \
  "document.querySelector('.gp-sheet').innerText.indexOf(S.cache.buses[0].engine)" "-1"

# Punctuation must not cry wolf, and a real swap must not slip through.
jck "serial compare ignores punctuation"  "gpNormSerial(' alt 77219 b ')===gpNormSerial('ALT-77219-B')" "true"
jck "serial compare still catches a swap" "gpNormSerial('ST-9999')===gpNormSerial('ST-4410')" "false"
# A gate pass printed from a phone in dark mode has to come out readable.
jck "the slip stays ink-on-paper in dark mode" \
  "(function(){var d=document.documentElement.getAttribute('data-theme');document.documentElement.setAttribute('data-theme','dark');var el=document.createElement('div');el.className='gp-sheet';document.body.appendChild(el);var c=getComputedStyle(el).backgroundColor;el.remove();if(d)document.documentElement.setAttribute('data-theme',d);else document.documentElement.removeAttribute('data-theme');return c})()" "rgb(255, 255, 255)"

# 2e) Every parts chooser is a search box, not a 2,391-option dropdown.
login store u-store 3 3 3 3
j "sheetReceive()" >/dev/null
settle "document.getElementById('pps-rcv')?'y':'n'" "y" 20 >/dev/null
jck "receive stock has a part search"   "document.getElementById('pps-rcv')?'y':'n'" "y"
jck "receive stock has no part dropdown" "document.querySelectorAll('.sheetwrap select#f-part').length" "0"
j "closeSheet();sheetAddStock()" >/dev/null
settle "document.getElementById('pps-stk')?'y':'n'" "y" 20 >/dev/null
jck "add stock has a part search"       "document.getElementById('pps-stk')?'y':'n'" "y"
jck "add stock has no part dropdown"    "document.querySelectorAll('.sheetwrap select#f-spart').length" "0"
# A bill has repeating part lines. Each needs its OWN picker, or two lines share
# a key and picking in one silently rewrites the other.
j "closeSheet();sheetAddPurchase()" >/dev/null
settle "document.querySelectorAll('.f-line').length>0?'y':'n'" "y" 20 >/dev/null
j "document.getElementById('f-addline').click()" >/dev/null
settle "String(document.querySelectorAll('.f-line').length)" "2" 20 >/dev/null
jck "each bill line gets its own picker" \
  "(function(){var k=[].slice.call(document.querySelectorAll('.f-line [data-pp]')).map(function(e){return e.getAttribute('data-pp')});return String(new Set(k).size===k.length&&k.length===2)})()" "true"
# savePurchase() reads row.querySelector('.f-lpart').value — the hidden input
# must keep that class or every bill line silently saves an empty part.
jck "bill line read-back still resolves" "document.querySelectorAll('.f-line .f-lpart').length" "2"
# Issuing defaults to what is actually on the shelf; restocking must not, because
# the part being restocked is usually the one at zero.
j "closeSheet();sheetIssue()" >/dev/null
settle "document.getElementById('pps-iss')?'y':'n'" "y" 20 >/dev/null
jck "issue defaults to in-stock parts only" \
  "String([].slice.call(document.querySelectorAll('#ppl-iss .li')).every(function(n){return !/Out of stock/.test(n.textContent)}))" "true"
j "closeSheet()" >/dev/null

# 2f) Registrations match however they are written, and the de-dupe keeps the real bus.
login owner u-owner 1 1 1 1
# AirFi sends the official zero-padded plate; 15 buses in the fleet list are not.
jck "MP44ZD471 matches the tracker's MP44ZD0471" "_normReg('MP44ZD471')===_normReg('MP44ZD0471')" "true"
jck "spacing and case still ignored"           "_normReg('mp44 zd 471')" "MP44ZD0471"
# No series letter means the district/number boundary is ambiguous: never guess.
jck "an ambiguous plate is left as written"    "_normReg('RJ14123')" "RJ14123"
# The padding makes a real bus and an AirFi-imported copy of it the same group,
# which turns the background de-dupe on for them. Every real bus scored 0 there,
# the same as the copy, so a tie could have deleted the real one.
j "window.__g='';(async function(){var n=Date.now();await DB.put('buses',{id:'g-ph',regNo:'QQ44ZD0471',source:'airfi',docs:[],createdAt:n});await DB.put('buses',{id:'g-real',regNo:'QQ44ZD471',source:'route-import',docs:[],createdAt:n-9e8});await DB.put('jobcards',{id:'g-job',busId:'g-real',problem:'x',status:'open',createdAt:n,updatedAt:n});await load();await cleanupFleet(true);window.__g=(byId(S.cache.buses,'g-real')?'kept':'LOST')+'/'+(byId(S.cache.buses,'g-ph')?'phantom-stays':'phantom-gone');})().catch(function(e){window.__g='ERR'})" >/dev/null
settle "window.__g||''" "kept/phantom-gone" 30 >/dev/null
jck "de-dupe keeps the real bus, drops the import" "window.__g" "kept/phantom-gone"
# The same rule for demo buses. Once a real fleet existed, the background pass
# stripped every demo bus on a two-minute timer, history or not, and synced
# the delete: their job cards, drivers, incidents and parts were left pointing
# at a bus that was gone (a job showed bus "—", a driver turned "unassigned").
# Unattended, a demo bus with records on it stays; a bare one still goes.
j "window.__dm='';(async function(){var n=Date.now();await DB.put('buses',{id:'g-dm-hist',regNo:'QQ01DM0001',source:'demo',docs:[],createdAt:n});await DB.put('buses',{id:'g-dm-bare',regNo:'QQ01DM0002',source:'demo',docs:[],createdAt:n});await DB.put('jobcards',{id:'g-dm-job',busId:'g-dm-hist',problem:'Gate demo history',status:'open',priority:'low',createdAt:n,updatedAt:n,assignees:[],partsUsed:[],beforePhotos:[],afterPhotos:[]});await load();await cleanupFleet(true);var r=(byId(S.cache.buses,'g-dm-hist')?'kept':'LOST')+'/'+(byId(S.cache.buses,'g-dm-bare')?'bare-stays':'bare-gone');await DB.softDel('jobcards','g-dm-job');await DB.softDel('buses','g-dm-hist');await load();window.__dm=r})().catch(function(e){window.__dm='ERR '+e.message})" >/dev/null
settle "window.__dm||''" "kept/bare-gone" 30 >/dev/null
jck "a demo bus with history survives the background cleanup" "(window.__dm||'').split('/')[0]" "kept"
jck "and a demo bus with none is still removed"               "(window.__dm||'').split('/')[1]" "bare-gone"

# 2g) Several mechanics on one job: each sees it, nobody else does.
login supervisor u-sup 2 2 2 2
j "window.__cs='';(async function(){var b=S.cache.buses[0],n=Date.now();await DB.put('jobcards',{id:'g-crew',busId:b.id,problem:'Gate crew job',status:'open',priority:'medium',createdAt:n,updatedAt:n,assignedTo:'u-m1',assignees:[{userId:'u-m1',task:'Electrical'},{userId:'u-m2',task:'Brakes'}],partsUsed:[],beforePhotos:[],afterPhotos:[]});await load();window.__cs='ok'})()" >/dev/null
settle "window.__cs||''" "ok" 25 >/dev/null
# assignedTo stays the first mechanic, so every older reader still sees a name.
jck "shared job keeps assignedTo as the lead"  "byId(S.cache.jobs,'g-crew').assignedTo" "u-m1"
jck "both mechanics are on the crew"           "jobCrew(byId(S.cache.jobs,'g-crew')).map(function(a){return a.userId}).join(',')" "u-m1,u-m2"
# A job saved by the previous build has no assignees array at all.
jck "an old single-mechanic job still reads"   "jobCrew({assignedTo:'u-m3'}).length" "1"
jck "a draft saved as a bare id still restores" "parseCrew('u-m3')[0].userId" "u-m3"
# The second mechanic — not assignedTo — must still get the job.
login mechanic u-m2 0 0 0 2
jck "second mechanic login" "S.user?S.user.id:'none'" "u-m2"
j "route({name:'jobs'})" >/dev/null
settle "S.route.name" "jobs" 20 >/dev/null
jck "the second mechanic sees the shared job" "document.querySelector('[data-job=\"g-crew\"]')?'yes':'no'" "yes"
j "route({name:'jobs',id:'g-crew'})" >/dev/null
settle "S.route.id||''" "g-crew" 20 >/dev/null
jck "and can open it" "String(/Gate crew job/.test(document.querySelector('.content').innerText))" "true"
# Being ON a job is not being allowed to CLOSE it. The job card's close section
# used to open for "mine", so a mechanic with both photos in got a live Close
# job button, and the close wrote 'done' on the phone that the server then
# refused. The earlier "no close button" check missed it: it looked only for
# markDone. Both photos are present here, so nothing else holds the close back.
j "window.__mc='';(async function(){var b=S.cache.buses[0],n=Date.now();await DB.put('jobcards',{id:'g-mclose',busId:b.id,problem:'Gate mechanic close',status:'in-progress',priority:'low',createdAt:n,updatedAt:n,assignedTo:'u-m2',assignees:[{userId:'u-m2',task:'Brakes'}],partsUsed:[],beforePhotos:['b'],afterPhotos:['a']});await load();route({name:'jobs',id:'g-mclose'});var btn=document.querySelector('[data-act=closeJob],[data-act=markDone]')?'button':'none';await confirmCloseJob('g-mclose');var st=byId(S.cache.jobs,'g-mclose').status;await DB.softDel('jobcards','g-mclose');await load();window.__mc=btn+'/'+st})().catch(function(e){window.__mc='ERR '+e.message})" >/dev/null
settle "window.__mc||''" "none/in-progress" 30 >/dev/null
jck "a mechanic's own live card offers no close"  "(window.__mc||'').split('/')[0]" "none"
jck "and closing it directly is refused"          "(window.__mc||'').split('/')[1]" "in-progress"
# A mechanic on neither side of it must not reach it, by list or by link.
login mechanic u-m3 0 0 0 3
j "route({name:'jobs'})" >/dev/null
settle "S.route.name" "jobs" 20 >/dev/null
jck "a mechanic not on it does not see it" "document.querySelector('[data-job=\"g-crew\"]')?'LEAK':'hidden'" "hidden"
j "route({name:'jobs',id:'g-crew'})" >/dev/null
sleep 1
jck "and a deep link does not open it" "String(/Gate crew job/.test(document.querySelector('.content').innerText))" "false"

# 2h) Challans: an old lookup made with the zero dropped is not trusted if it found nothing.
login owner u-owner 1 1 1 1
jck "challan lookup asks for the official plate" "normReg('MP44ZD471')" "MP44ZD0471"
jck "an empty old snapshot is treated as unchecked" \
  "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'MP44ZD471',total:0,pendingCount:0,pendingFine:0}];_chSnapFrom=null;var r=challanFor('MP44ZD471')?'TRUSTED':'unchecked';S.cache.challans=s;_chSnapFrom=null;return r})()" "unchecked"
jck "an old snapshot that FOUND challans is kept" \
  "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'NL07B585',total:3,pendingCount:2,pendingFine:1000}];_chSnapFrom=null;var c=challanFor('NL07B585');S.cache.challans=s;_chSnapFrom=null;return c?String(c.pendingFine):'LOST'})()" "1000"
# Old and fresh snapshot for one bus must not add that bus's fines twice.
jck "fines are counted once per bus" \
  "(function(){var s=S.cache.challans;S.cache.challans=[{rc:'RJ14PF207',total:2,pendingCount:2,pendingFine:500,fetchedAt:1},{rc:'RJ14PF0207',total:2,pendingCount:1,pendingFine:200,fetchedAt:2}];_chSnapFrom=null;var f=fleetChallanTotals().fine;S.cache.challans=s;_chSnapFrom=null;return String(f)})()" "200"
# Ids are names that already exist: they keep the stored spelling.
jck "record ids keep the stored spelling"   "_regIdKey('MP44 ZD 471')" "MP44ZD471"

# 2i) The supervisor's own work signs itself off; the owner's does not.
jck "supervisor closes = signed off"        "String(selfSignsOff('supervisor'))" "true"
jck "owner still needs a second person"     "String(selfSignsOff('owner'))" "false"
login supervisor u-sup 2 2 2 2
j "window.__sv='';(async function(){var b=S.cache.buses[0],n=Date.now();await DB.put('jobcards',{id:'g-sv',busId:b.id,problem:'Gate supervisor close',status:'open',priority:'low',createdAt:n,updatedAt:n,assignedTo:'u-m1',beforePhotos:['b'],afterPhotos:['a'],partsUsed:[]});await load();await markDone('g-sv');var j=byId(S.cache.jobs,'g-sv');window.__sv=j.status+'/'+j.verifiedBy+'/'+j.closedBy})().catch(function(e){window.__sv='ERR '+e.message})" >/dev/null
settle "window.__sv||''" "verified/u-sup/u-sup" 30 >/dev/null
jck "a supervisor's close is verified in the same step" "window.__sv" "verified/u-sup/u-sup"

# 2j) A bus away at a workshop in another city is NOT standing in our yard, and
# a card made by mistake can be removed — but never by losing the parts on it.
login owner u-owner 1 1 1 1
j "window.__ow='';(async function(){var b=S.cache.buses[0],n=Date.now();
  await DB.put('jobcards',{id:'g-out',busId:b.id,problem:'Gate outside job',status:'open',priority:'low',createdAt:n,updatedAt:n,assignees:[],partsUsed:[],beforePhotos:[],afterPhotos:[],outside:true,outsideCity:'Noida'});
  await load();
  window.__ow=[inShopJobs().some(function(x){return x.id==='g-out'}),awayJobs().some(function(x){return x.id==='g-out'})].join('/')
})().catch(function(e){window.__ow='ERR '+e.message})" >/dev/null
settle "window.__ow||''" "false/true" 30 >/dev/null
jck "an outside job is not in the shop list"   "window.__ow" "false/true"
jck "and the owner's home shows it as away"    "String(/Away for repair/.test(awayCard(awayJobs())))" "true"
jck "the row says which city"                  "String(/Noida/.test(jobLi(byId(S.cache.jobs,'g-out'))))" "true"
# The delete button is the owner's alone.
jck "owner sees a delete button"               "String(/deleteJob\"/.test(actionsForJob(byId(S.cache.jobs,'g-out'),true)))" "true"
login supervisor u-sup 2 2 2 2
jck "the supervisor does not"                   "String(/deleteJob\"/.test(actionsForJob(byId(S.cache.jobs,'g-out'),true)))" "false"
jck "and cannot delete through the action"      "(function(){var r=canDeleteJob();return String(r)})()" "false"
# Deleting a card that had a part issued must put that part back in the store,
# because jobPartGaps() stops accounting for a card once it is gone.
login owner u-owner 1 1 1 1
j "window.__dj='';(async function(){var b=S.cache.buses[0],p=S.cache.parts.filter(function(x){return x.qty>2})[0],n=Date.now();
  await DB.put('jobcards',{id:'g-del',busId:b.id,problem:'Gate delete me',status:'open',priority:'low',createdAt:n,updatedAt:n,assignees:[],partsUsed:[],beforePhotos:[],afterPhotos:[]});
  await load();
  await issuePart({partId:p.id,qty:2,jobId:'g-del'});
  var mid=byId(S.cache.parts,p.id).qty;
  await doDeleteJob('g-del');
  window.__dj=[byId(S.cache.jobs,'g-del')?'STILL':'gone',String(byId(S.cache.parts,p.id).qty-mid)].join('/')
})().catch(function(e){window.__dj='ERR '+e.message})" >/dev/null
settle "window.__dj||''" "gone/2" 40 >/dev/null
jck "deleting a card returns its parts to stock" "window.__dj" "gone/2"
jck "and the ledger says where they came from"   "String((S.cache.ledger||[]).some(function(l){return l.type==='in'&&/deleted job card/i.test(l.reason||'')}))" "true"

# 2k) The pump is the only moment an odometer reading can still be checked, so
# the fill form has to show the last one and what this tank is worth — and the
# per-fill maths must never disagree with the lifetime average on the report.
login owner u-owner 1 1 1 1
j "window.__fu='';(async function(){var b=S.cache.buses[0],day=86400000,n=Date.now();
  var set=[[480000,60,1,28],[480420,60,1,21],[480700,20,0,14],[480840,40,1,7]];
  for(var i=0;i<set.length;i++){var f=set[i];
    await DB.put('fuel',{id:'g-fu-'+f[0],busId:b.id,litres:f[1],cost:f[1]*90,odometer:f[0],full:!!f[2],at:n-f[3]*day,pump:'Gate pump',by:'u-owner'});}
  b.odometer=481260;await DB.put('buses',b);await load();
  var segs=fillSegments(b.id),m=busMileage(b.id);
  window.__fu=[segs[3].kmpl.toFixed(1),segs[3].span,segs[2].kmpl===null?'partial':'SEG',m.avgKmpl.toFixed(1)].join('/')
})().catch(function(e){window.__fu='ERR '+e.message})" >/dev/null
settle "window.__fu||''" "7.0/420/partial/7.0" 40 >/dev/null
jck "a part fill rides into the next full tank"  "window.__fu" "7.0/420/partial/7.0"
jck "the last fill is the one with a reading"    "String(lastFillWithOdo(S.cache.buses[0].id).odometer)" "480840"
# The panel is what the person at the pump actually reads.
jck "the run since the last fill is shown"       "String(/420 km/.test(fuelOdoPanel(S.cache.buses[0].id,481260,60,false)))" "true"
jck "and this tank's km/l"                       "String(/7\.0 km\/l/.test(fuelOdoPanel(S.cache.buses[0].id,481260,60,false)))" "true"
jck "a reading lower than last time is called out" \
  "String(/Lower than the last fill/.test(fuelOdoPanel(S.cache.buses[0].id,480100,60,false)))" "true"
jck "a broken odometer measures nothing"         "String(/not working/.test(fuelOdoPanel(S.cache.buses[0].id,481260,60,true)))" "true"
# Saving a backwards reading asks once rather than averaging it in silently.
j "window.__fb='';(async function(){var b=S.cache.buses[0];sheetAddFuel(b.id);
  await new Promise(function(r){setTimeout(r,150)});
  document.getElementById('f-flitres').value='50';document.getElementById('f-fcost').value='4500';
  document.getElementById('f-fodo').value='480100';
  var n0=(S.cache.fuel||[]).length;await saveFuel();var n1=(S.cache.fuel||[]).length;
  await saveFuel();await new Promise(function(r){setTimeout(r,300)});
  window.__fb=[n1===n0?'refused':'SAVED',(S.cache.fuel||[]).length===n0+1?'then saved':'LOST'].join('/')
})().catch(function(e){window.__fb='ERR '+e.message})" >/dev/null
settle "window.__fb||''" "refused/then saved" 40 >/dev/null
jck "a backwards reading asks before it is taken" "window.__fb" "refused/then saved"
j "closeSheet()" >/dev/null

# 2l) Batteries die by age, not by kilometres — and a dead one inside warranty
# is a claim, not a purchase. Both have to be true for the alert to be any use.
login owner u-owner 1 1 1 1
j "window.__bt='';(async function(){var b=S.cache.buses[0],n=Date.now(),M=30.44*24*3600*1000;
  await DB.put('components',{id:'g-bat',kind:'battery',label:'Battery 1',serial:'GATE-4471',busId:b.id,position:'Battery 1',
    state:'in-service',installedAt:n-40*M,installedOdo:0,lifeKm:0,lifeMonths:36,maxRefurb:2,refurbCount:0,
    boughtAt:n-40*M,warrantyMonths:48,history:[],createdAt:n-40*M,updatedAt:n});
  await load();
  var c=byId(S.cache.components,'g-bat'),lf=componentLife(c),a=componentAlerts().find(function(x){return x.c.id==='g-bat'});
  window.__bt=[lf.basis,lf.status,String(lf.monthsUsed),inWarranty(c)?'claim':'expired',a?'alerted':'SILENT'].join('/')
})().catch(function(e){window.__bt='ERR '+e.message})" >/dev/null
settle "window.__bt||''" "months/overdue/40/claim/alerted" 40 >/dev/null
jck "an aged battery is overdue on months"     "window.__bt" "months/overdue/40/claim/alerted"
jck "and the alert says to claim the warranty" "String(/claim it before buying another/.test((componentAlerts().find(function(x){return x.c.id==='g-bat'})||{}).msg||''))" "true"
jck "a tyre still measures in kilometres"      "componentLife({kind:'tyre',state:'in-service',lifeKm:60000,installedOdo:0,busId:S.cache.buses[0].id}).basis" "km"
jck "the battery name is not doubled"          "posLabel('Battery','Battery 1')" "Battery 1"
jck "a tyre position still reads as one"       "posLabel('Tyre','FR')" "Tyre FR"
# The fit sheet is the same form with a different piece in it.
j "sheetFitBatteries(S.cache.buses[0].id)" >/dev/null
settle "document.getElementById('ty-warr-0')?'yes':'no'" "yes" 20 >/dev/null
jck "fitting batteries asks for the warranty"  "document.getElementById('ty-warr-0')?'yes':'no'" "yes"
jck "and opens two rows, not four"             "String(document.querySelectorAll('#ty-rows .tyrow').length)" "2"
j "closeSheet();sheetFitTyres(S.cache.buses[0].id)" >/dev/null
settle "String(document.querySelectorAll('#ty-rows .tyrow').length)" "4" 20 >/dev/null
jck "tyres still open four rows and no warranty" \
  "[document.querySelectorAll('#ty-rows .tyrow').length,document.getElementById('ty-warr-0')?'warr':'none'].join('/')" "4/none"
j "closeSheet()" >/dev/null

# 2m) The fleet reads as vehicle cards, and the search still filters them.
j "navTab('fleet')" >/dev/null
settle "S.route.name" "fleet" 20 >/dev/null
jck "the fleet is vehicle cards"   "String(document.querySelectorAll('#fleet-list .vcard').length>0)" "true"
jck "each card names its driver"   "String(/DRIVER|ड्राइवर/i.test(document.querySelector('#fleet-list .vcard').innerText))" "true"
jck "and search still filters them" \
  "(function(){var i=document.getElementById('fleet-search');i.value='zzzznope';i.oninput();var n=[].slice.call(document.querySelectorAll('#fleet-list .vcard')).filter(function(c){return c.style.display!=='none'}).length;i.value='';i.oninput();return String(n)})()" "0"

# 2n) A document on file and a document scanned are different facts. Counting
# only scans made every crew member read "3 docs missing", and a number that
# can never be good is a number everyone scrolls past.
login owner u-owner 1 1 1 1
jck "a typed licence number counts as on file" \
  "(function(){var d={role:'driver',license:'RJ14 2019 0001234'};var s=driverDocStatus(d);return s.mandHave+'/'+s.mandTotal})()" "1/3"
jck "but it is not counted as scanned" \
  "(function(){var d={role:'driver',license:'RJ14 2019 0001234'};return String(driverDocStatus(d).mandDone)})()" "0"
jck "the joining photo is the photo document" \
  "(function(){var d={role:'driver',photo:'data:image/jpeg;base64,x'};var s=driverDocStatus(d);return s.mandDone+'/'+s.mandHave})()" "1/1"
jck "a fully documented driver reads complete" \
  "(function(){var d={role:'driver',photo:'p',docs:{license:{photo:'l'},aadhaar:{photo:'a'}}};var s=driverDocStatus(d);return s.mandHave+'/'+s.mandDone+'/'+s.pct})()" "3/3/100"
jck "numbers only still reads 100% on file" \
  "(function(){var d={role:'driver',license:'X',photo:'p',docs:{aadhaar:{number:'1234'}}};var s=driverDocStatus(d);return s.mandHave+'/'+s.mandDone+'/'+s.pct})()" "3/1/100"
jck "a blank record is still flagged" \
  "(function(){var s=driverDocStatus({role:'driver'});return s.mandHave+'/'+s.pct})()" "0/0"
# The alarm is "nothing recorded", not "not scanned".
jck "the crew filter flags only the blank one" \
  "(function(){var blank={role:'driver'},num={role:'driver',license:'X',photo:'p',docs:{aadhaar:{number:'1'}}};
     return String(crewMatchesFilter(blank,'incomplete'))+'/'+String(crewMatchesFilter(num,'incomplete'))})()" "true/false"

# 2p) A bus in the workshop does not need a driver today, and a shortfall that
# no amount of filling in can fix is a hiring fact, not a duty-board one.
login owner u-owner 1 1 1 1
# Measured as a DELTA, not an absolute: earlier sections of this gate leave
# their own open job cards behind, so "two buses are excluded" was only ever
# true on a clean fleet. Pick two buses that are currently free, and assert
# that putting a card on each removes exactly those two.
j "window.__dz='';(async function(){var free=busesNeedingCrew(),b0=free[0],b1=free[1],n=Date.now();
  var before=free.length;
  await DB.put('jobcards',{id:'g-dz1',busId:b0.id,problem:'In our shop',status:'open',priority:'low',createdAt:n,updatedAt:n,assignees:[],partsUsed:[],beforePhotos:[],afterPhotos:[]});
  await DB.put('jobcards',{id:'g-dz2',busId:b1.id,problem:'At a vendor',status:'open',priority:'low',createdAt:n,updatedAt:n,assignees:[],partsUsed:[],beforePhotos:[],afterPhotos:[],outside:true,outsideCity:'Noida'});
  await load();
  var after=busesNeedingCrew();
  var gone=after.every(function(b){return b.id!==b0.id&&b.id!==b1.id});
  window.__dz=[before-after.length,gone?'excluded':'INCLUDED'].join('/')
})().catch(function(e){window.__dz='ERR '+e.message})" >/dev/null
settle "window.__dz||''" "2/excluded" 40 >/dev/null
jck "a bus in the shop or away needs no driver"  "window.__dz" "2/excluded"
# Coverage arithmetic: free people, fillable seats, and the part nobody can fill.
jck "coverage counts free drivers" \
  "(function(){var c=crewCoverage('driver');return String(c.free===activeCrew().filter(function(d){return crewRoleOf(d)==='driver'&&!d.busId}).length)})()" "true"
jck "fillable never exceeds the free pool" \
  "(function(){var c=crewCoverage('driver');return String(c.fillable<=c.free&&c.fillable<=c.short)})()" "true"
jck "short splits into fillable and unstaffable" \
  "(function(){var c=crewCoverage('driver');return String(c.short===c.fillable+c.unstaffable)})()" "true"
jck "conductors are counted on their own pool" \
  "(function(){var c=crewCoverage('conductor');return String(c.pool===activeCrew().filter(function(d){return crewRoleOf(d)==='conductor'}).length)})()" "true"
j "(async function(){await DB.softDel('jobcards','g-dz1');await DB.softDel('jobcards','g-dz2');await load()})()" >/dev/null

# 2q) A driver reaches their own bus and nothing of the workshop's. These three
# routes had no ROUTE_PERM entry, so a forced history route showed a driver
# the fleet's spend, every bus and the mechanics' names. Forcing them must
# land on home, like every other gated route.
login driver u-d1 0 0 1 0
for R in history outsidejobs gatepass; do
  jck "a driver cannot force open $R" "(function(){route({name:'$R'});return S.route.name})()" "home"
done

# 2q) The expensive indexes are memoised on what they READ, not on the cache
# object. A stale memo would be far worse than a slow app, so the tests that
# matter are the invalidations, not the speed-up.
login owner u-owner 1 1 1 1
jck "a store signature moves when a row is added" \
  "(function(){var a=[{id:'1',updatedAt:5}];var s1=storeSig(a);var s2=storeSig(a.concat([{id:'2',updatedAt:6}]));return String(s1!==s2)})()" "true"
jck "and when a row is edited in place" \
  "(function(){var s1=storeSig([{id:'1',updatedAt:5}]);var s2=storeSig([{id:'1',updatedAt:9}]);return String(s1!==s2)})()" "true"
jck "and when a row is removed" \
  "(function(){var s1=storeSig([{id:'1',updatedAt:5},{id:'2',updatedAt:5}]);var s2=storeSig([{id:'1',updatedAt:5}]);return String(s1!==s2)})()" "true"
jck "but not when nothing changed" \
  "(function(){var a=[{id:'1',updatedAt:5}];return String(storeSig(a)===storeSig(a.slice()))})()" "true"
jck "an empty store has a stable signature" "storeSig([])+'/'+storeSig(null)" "0/0"
# The behaviour that caused the slowness: a new cache object with the same data.
jck "insights are not recomputed for a new cache object" \
  "(function(){var a=computeInsights();S.cache=Object.assign({},S.cache);return String(computeInsights()===a)})()" "true"
jck "but ARE recomputed when a job changes" \
  "(function(){var a=computeInsights();S.cache.jobs=S.cache.jobs.concat([{id:'zperf',busId:S.cache.buses[0].id,problem:'p',status:'verified',afterPhotos:[],partsUsed:[{partId:(S.cache.parts[0]||{}).id,qty:1,cost:500}],createdAt:Date.now(),updatedAt:Date.now()}]);var b=computeInsights();S.cache.jobs=S.cache.jobs.slice(0,-1);return String(a!==b)})()" "true"
jck "the review index holds when an unrelated store changes" \
  "(function(){var m=rvCrewIndex();S.cache.fuel=(S.cache.fuel||[]).concat([{id:'zperf-f',busId:S.cache.buses[0].id,litres:1,at:Date.now(),updatedAt:Date.now()}]);var r=rvCrewIndex()===m;S.cache.fuel=S.cache.fuel.slice(0,-1);return String(r)})()" "true"

# 2r) The indexes that made the app feel slow, and the two ways each can break:
# failing to rebuild when its data changed, and rebuilding when it did not.
# Written synchronously -- replacing an array in S.cache is what a sync tick does
# to it anyway, and an awaited body here wedged two pushes before it ever managed
# to test anything.
login owner u-owner 1 1 1 1
jck "the load path reads only what changed" "typeof CACHE_STORES + '/' + typeof DB.dirtySnapshot" "object/function"
jck "only gpsevents is read on a delay" "Object.keys(SLOW_STORES).join(',')" "gpsevents"
jck "every cache key names a store" \
  "Object.keys(CACHE_STORES).filter(function(k){return !CACHE_STORES[k][0]}).join(',')||'none'" "none"
jck "a marked store is dirty, and clearing takes only what was named" \
  "(function(){DB.markDirty('zq');var a=DB.dirtySnapshot().has('zq');DB.clearDirty(new Set(['zq']));return String(a&&!DB.dirtySnapshot().has('zq'))})()" "true"

# The bulk pair sync's pull now applies a page through. The decision is covered by
# test_pullapply.js (against every combination of timestamp and redaction flag) and
# the server paging by test_pullbytes.py / test_pulldefer.py; this is the only place
# the IndexedDB half runs at all, because the gate serves the app with no sync
# endpoint. Without these they would ship untested.
#
# Fired and then polled, never awaited through `js`: handing a promise back to the
# browser is what held this gate open for fourteen minutes once. One async block
# does all of it and leaves a single flat string behind.
j "window.__zbulk='';(async function(){
  try{
    var out=[];
    var c=await DB.bulkPutRaw('parts',[{id:'zb1',name:'A',updatedAt:777},{id:'zb2',name:'B',updatedAt:777}]);
    var g=await DB.bulkRawGet('parts',['zb1','zb2']);
    out.push('count='+c);
    out.push('names='+(((g.zb1||{}).name||'-')+((g.zb2||{}).name||'-')));
    await DB.bulkPutRaw('parts',[{id:'zb3',name:'C',updatedAt:12345}]);
    var g3=await DB.bulkRawGet('parts',['zb3']);
    out.push('stamp='+String((g3.zb3||{}).updatedAt));
    DB.clearDirty(new Set(['parts']));
    await DB.bulkPutRaw('parts',[{id:'zb4',updatedAt:1}]);
    out.push('dirty='+String(DB.dirtySnapshot().has('parts')));
    var seen=0,was=DB.onChange; DB.onChange=function(){seen++};
    await DB.bulkPutRaw('parts',[{id:'zb5',updatedAt:1}]);
    DB.onChange=was; out.push('echo='+seen);
    var gm=await DB.bulkRawGet('parts',['zb1','zb-missing']);
    out.push('got='+String(!!gm.zb1)+'/'+String('zb-missing' in gm));
    var ge=await DB.bulkRawGet('parts',[]);
    out.push('empty='+Object.keys(ge).length);
    var rows=[],i; for(i=0;i<600;i++) rows.push({id:'zp'+i,updatedAt:1});
    var t0=performance.now(); await DB.bulkPutRaw('parts',rows); var bulk=performance.now()-t0;
    var t1=performance.now();
    for(i=0;i<60;i++) await DB.putRaw('parts',{id:'zs'+i,updatedAt:1});
    var per=(performance.now()-t1)/60*600;
    out.push('faster='+String(bulk<per)); out.push('ratio='+Math.round(per/Math.max(bulk,0.01)));
    window.__zbulk=out.join('|');
  }catch(e){ window.__zbulk='threw='+(e&&e.name||e); }
})()" >/dev/null
settle "window.__zbulk?'done':''" "done" 40 >/dev/null
# Read back as plain synchronous string lookups, so each failure names itself.
jck "the bulk IO block ran at all"                                    "(window.__zbulk||'empty').split('|')[0].indexOf('threw')<0?'ok':(window.__zbulk||'empty')" "ok"
jck "bulkPutRaw writes every row in the page"                         "/count=(\\d+)/.exec(window.__zbulk||'')[1]" "2"
jck "…and they read back through bulkRawGet"                          "/names=(\\S\\S)/.exec(window.__zbulk||'')[1]" "AB"
# A bulk version that stamped updatedAt would make every pulled record look locally
# edited, and the device would push the whole table back as its own changes.
jck "bulkPutRaw keeps the server's updatedAt instead of stamping now" "/stamp=(\\d+)/.exec(window.__zbulk||'')[1]" "12345"
jck "bulkPutRaw marks the store dirty, so load() reads it back"       "/dirty=(\\w+)/.exec(window.__zbulk||'')[1]" "true"
jck "bulkPutRaw does not echo the server's records into the outbox"   "/echo=(\\d+)/.exec(window.__zbulk||'')[1]" "0"
jck "bulkRawGet returns what is there and omits what is not"          "/got=(\\S+?)\\|/.exec(window.__zbulk+'|')[1]" "true/false"
jck "bulkRawGet of nothing is empty, not a thrown transaction"        "/empty=(\\d+)/.exec(window.__zbulk||'')[1]" "0"
jck "a page applies faster in bulk than one record at a time"         "/faster=(\\w+)/.exec(window.__zbulk||'')[1]" "true"

# gpsEventsForBus scanned all forty thousand events per call, normalising every
# registration as it went, and driverScore calls it once per driver -- 4.4 million
# string rewrites to draw one crew list. Grouped once now.
jck "the GPS index agrees with scanning the table by hand" \
  "(function(){var b=S.cache.buses[0];var nr=_normReg(b.regNo);var brute=(S.cache.gpsevents||[]).filter(function(e){return _normReg(e.reg)===nr}).length;return String(gpsEventsForBus(b.id).length===brute)})()" "true"
jck "and is not rebuilt while the events are unchanged" "String(gpsByBus()===gpsByBus())" "true"
jck "but IS rebuilt when an event arrives" \
  "(function(){var m=gpsByBus();S.cache.gpsevents=(S.cache.gpsevents||[]).concat([{id:'zq-g',reg:S.cache.buses[0].regNo,at:Date.now(),type:'overspeed',updatedAt:Date.now()}]);var r=gpsByBus()!==m;S.cache.gpsevents=S.cache.gpsevents.slice(0,-1);return String(r)})()" "true"

# The screens that list crew ask for a score once per crew member.
jck "a crew score is not recomputed while nothing has changed" \
  "(function(){var d=(activeCrew()[0]||{}).id;return String(driverOverall(d)===driverOverall(d))})()" "true"
jck "but IS recomputed when a review arrives" \
  "(function(){var d=(activeCrew()[0]||{}).id;var a=driverOverall(d);S.cache.rbreviews=(S.cache.rbreviews||[]).concat([{id:'zq-r',stars:1,at:Date.now(),updatedAt:Date.now()}]);var r=driverOverall(d)!==a;S.cache.rbreviews=S.cache.rbreviews.slice(0,-1);return String(r)})()" "true"
jck "and when an incident is recorded" \
  "(function(){var d=(activeCrew()[0]||{}).id;var a=driverOverall(d);S.cache.incidents=(S.cache.incidents||[]).concat([{id:'zq-i',driverId:d,type:'accident',at:Date.now(),updatedAt:Date.now()}]);var r=driverOverall(d)!==a;S.cache.incidents=S.cache.incidents.slice(0,-1);return String(r)})()" "true"

# The signature behind every memo is remembered per store, so checking a memo no
# longer re-reads the table it is guarding -- that alone cost 200ms per crew list.
jck "a store signature is reused while the array is the same" \
  "String(cachedSig('gpsevents')===cachedSig('gpsevents'))" "true"
jck "and recomputed the moment the array is replaced" \
  "(function(){var a=cachedSig('fuel');S.cache.fuel=(S.cache.fuel||[]).concat([{id:'zq-f',at:Date.now(),updatedAt:Date.now()}]);var r=cachedSig('fuel')!==a;S.cache.fuel=S.cache.fuel.slice(0,-1);return String(r)})()" "true"

# 3) Invariant sweep: form controls never navigate (owner's main tabs).
login owner u-owner 1 1 1 1
for SCREEN in home jobs store me; do
  j "navTab('$SCREEN')" >/dev/null
  settle "S.route.name" "$SCREEN" 20 >/dev/null
  RES="$(j "var r=S.route.name;Array.from(document.querySelectorAll('input,select,textarea')).forEach(function(e){e.dispatchEvent(new MouseEvent('click',{bubbles:true}));});S.route.name===r?'stable':'MOVED'")"
  ck "owner/$SCREEN: form controls don't navigate" "$RES" "stable"
done

# ===========================================================================
# 4) The design-system gallery (ui/gallery.html).
#
# The gallery is the page a person opens on an office PC (Windows 7, Chrome 109)
# and on the oldest driver phone to find out whether the design system works
# there; here it is also the fixture the gate drives. Everything above tested the
# live app. This block tests ui/, which the live app does not load yet.
#
# It runs LAST, and on 127.0.0.1 rather than localhost: a different origin from
# the one the checks above used, so the gallery never meets the app's service
# worker, caches or IndexedDB, and the app's state is untouched. The viewport is
# changed for the overflow checks and put back.
#
# THE EXPRESSIONS BELOW ARE IN SINGLE QUOTES, NOT INLINE IN "$(j "...")" AS ABOVE,
# AND THAT IS DELIBERATE. This gate runs under macOS's bash 3.2, which brace-expands
# the text of a "$(cmd "...")" even though it sits inside double quotes: any { }
# holding a comma -- a function body that calls f(a,b), an object literal, a
# "var a=1,b=2" -- splits the whole argument into several words. The JS that
# reaches the browser is not the JS that was written, and ck is handed extra
# arguments. 26 of the checks above were written that way and passed vacuously;
# they now go through jck() and the inline form is banned by the self-check at the
# top of this file. A single-quoted
# string is never touched, so gck() takes the expression that way and substitutes
# @REQ@, @STATES@ and @EMOJI@ itself. Strings inside the expressions are therefore
# double-quoted. ck is still called with exactly three arguments, as above.
#
# Two further rules (the gate has been fooled by both before):
#  - a check that looks at "all the X" first counts the X and fails when there
#    are none: querySelectorAll matching nothing must never read as a pass;
#  - every expression is synchronous and returns a plain string. The one thing
#    that is asynchronous (an overlay finishing its exit) is waited for with
#    settle(), never by handing js a promise.
# ===========================================================================
echo "── design-system gallery ──"
GAL="http://127.0.0.1:$PORT/ui/gallery.html"

# desc, expression (single-quoted, may use @REQ@ @STATES@ @EMOJI@), expected
GAL_REQ="button field select row card table badge tabs stat icons empty error offline skeleton figure sheet confirm toast"
# component|selector pairs. Each must match at least once inside that component's yard panel AND its desk panel.
GAL_STATES='button|.btn;button|.btn-primary;button|.btn-quiet;button|.btn-danger;button|.btn:disabled;button|.btn[aria-disabled=true];button|a.btn;button|.btn svg;button|.btn[aria-label];field|input.field:placeholder-shown;field|input.field:not(:placeholder-shown);field|textarea.field;field|.field[aria-invalid=true];field|.field:disabled;select|select.select;select|.select:disabled;row|div.v2row;row|button.v2row;row|a.v2row;row|.v2row .lead svg;row|.v2row .act .btn;row|.v2row .act .badge;row|.v2row .act .figure;row|[data-sample=long].v2row;row|.v2row[lang=hi];card|.card;card|.card .btn;card|.card .stat;table|table.table;table|.table th;table|.table td.fig .figure[data-state=value];table|.table td.fig .figure[data-state=unknown];table|.table .badge;badge|.badge:not(.badge-ok):not(.badge-warn):not(.badge-bad);badge|.badge-ok;badge|.badge-warn;badge|.badge-bad;badge|.badge svg;tabs|.tabs[role=tablist];tabs|.tabs [role=tab][aria-selected=true];tabs|.tabs [role=tab][aria-selected=false];stat|.stat .k;stat|.stat .v;stat|.stat .figure[data-state=stale];stat|.stat .figure[data-state=unknown];icons|[data-icon] svg;empty|.state.empty;empty|.state.empty .state-hint;empty|.state.empty svg;error|[data-sample=with-retry] .state-error [data-state-retry];error|[data-sample=no-retry] .state-error;offline|.state-offline;offline|.state-offline .state-hint;skeleton|.skeleton[aria-busy=true];skeleton|[data-sample=one-row] .skeleton-row;figure|[data-sample=unknown] .figure[data-state=unknown];figure|[data-sample=zero] .figure[data-state=value];figure|[data-sample=value] .figure[data-state=value];figure|[data-sample=unit] .figure-u;figure|[data-sample=recent] .figure-note;figure|[data-sample=stale] .figure[data-state=stale] .figure-note-stale;figure|[data-sample=stale-no-at] .figure-note-stale;figure|[data-sample=at-unreadable] .figure-note;figure|[data-sample=unknown-with-at] .figure[data-state=unknown];sheet|[data-open=sheet];sheet|[data-open=sheet-long];confirm|[data-open=confirm];confirm|[data-open=confirm-danger];toast|[data-open=toast-ok];toast|[data-open=toast-warn];toast|[data-open=toast-bad];toast|[data-open=toast-stay]'
# The emoji detector: surrogate pairs (every emoji outside the BMP), the arrows, technical, enclosed, dingbat and symbol
# blocks, the variation selector, the joiner and the keycap mark. A dash and an ellipsis are fine.
GAL_EMOJI='function(s){return /[\uD800-\uDBFF][\uDC00-\uDFFF]|[←-⇿⌀-⏿①-➿⤀-⯿️‍⃣]/.test(s)?"found":"none"}'
# A browse call that cannot wedge the gate, for the same reason j() is bounded: a hung daemon once held a push open for
# fourteen minutes. A call that times out returns nothing, which reads as a failed check, loudly and in the right place.
bb() { perl -e 'alarm shift; exec @ARGV' 25 "$B" "$@" 2>/dev/null; }
gck() {
  local js="$2"
  js="${js//@REQ@/$GAL_REQ}"; js="${js//@STATES@/$GAL_STATES}"; js="${js//@EMOJI@/$GAL_EMOJI}"
  jck "$1" "$js" "$3"
}

# 4a) The source files. These read the files, not the page, so they hold even if the page is broken.
UI_NONASCII="$(perl -ne 'print "$ARGV " if /[^\x00-\x7F]/ and !$seen{$ARGV}++' "$REPO"/ui/* 2>/dev/null)"
ck "ui/ is pure ASCII, so it holds no emoji or glyph a Windows 7 font lacks (gallery.html is in the scan)" \
  "$([ -s "$REPO/ui/gallery.html" ] && echo present || echo absent):${UI_NONASCII:-none}" "present:none"
ck "that ASCII scan can fail (it flags a file holding a bus emoji)" \
  "$(printf '\xf0\x9f\x9a\x8c\n' | perl -ne 'print "flagged" if /[^\x00-\x7F]/')" "flagged"
# Names the Chrome 109 floor forbids, plus ES6 syntax the oldest phones may lack. A grep finds only a name it is
# given, so CSS nesting (which has no name) is NOT covered here; test_ui_components.js reads the stylesheets for that.
#
# Only the page's CODE is scanned: the bodies of <script> and <style> and style="" attributes, with comments and string
# literals taken out first. Scanned as plain text the whole file would turn red on ordinary English ("let the team pick" in a
# comment, "a class of vehicle" in copy), and a gate that cries wolf gets re-run until someone re-runs it past a real failure.
# Whitespace after const, let and class is any whitespace, not just a space.
GAL_BANNED_RE='oklch|color-mix|@starting-style|view-transition|popover|subgrid|text-wrap|@layer|=>|`|\?\.[A-Za-z_$]| \?\? |(^|[^A-Za-z_.$-])(const|let|class)[[:space:]]+[A-Za-z_$[{]'
gal_banned() { # file -> the banned things found in the file's code, one per line
  perl -0ne 'my $c = ""; while (/<(script|style)\b[^>]*>(.*?)<\/\1>/gis) { $c .= "$2\n" } while (/\bstyle="([^"]*)"/gi) { $c .= "$1\n" } $c =~ s{("(?:[^"\\\n]|\\.)*"|\x27(?:[^\x27\\\n]|\\.)*\x27)|/\*.*?\*/|//[^\n]*}{defined $1 ? "\"\"" : " "}gse; print $c' "$1" | grep -oiE "$GAL_BANNED_RE" | sort -u
}
GAL_BANNED="$(gal_banned "$REPO/ui/gallery.html" 2>/dev/null | tr '\n' ' ')"
ck "gallery.html's code (script, style, style attributes; not its prose or comments) names none of: oklch, color-mix, @starting-style, view-transition, popover, subgrid, text-wrap, @layer, =>, a backtick, ?., ??, a const, let or class declaration" \
  "$([ -s "$REPO/ui/gallery.html" ] && echo present || echo absent):${GAL_BANNED:-none}" "present:none"
# One known-bad line per pattern; every one must be found, so no pattern in the list can be dead.
GAL_BANNED_SAMPLES='background: oklch(60% 0.1 20);
background: color-mix(in srgb, red, blue);
@starting-style { a { opacity: 0 } }
@view-transition { navigation: auto }
<div popover>
grid-template-columns: subgrid;
text-wrap: balance;
@layer base { a { color: red } }
var f = (a) => a;
var s = `x`;
var v = o?.p;
var w = a ?? b;
const x = 1;
let y;
for (const k of z) {}
class Foo {}'
GAL_TAB_SAMPLE="$(printf 'let\tx = 1;')"
GAL_SCAN_TMP="$(mktemp -t galscan)"
# One page per known-bad line, the line inside a <script>.
gal_selftest_hits() {
  local line n=0
  while IFS= read -r line; do
    printf '<script>\n%s\n</script>\n' "$line" > "$GAL_SCAN_TMP"
    [ -n "$(gal_banned "$GAL_SCAN_TMP")" ] && n=$((n+1))
  done
  echo "$n"
}
ck "that code scan can fail: it finds each of 17 known-bad lines in a script, one per pattern, including let followed by a tab" \
  "$(printf '%s\n%s\n' "$GAL_BANNED_SAMPLES" "$GAL_TAB_SAMPLE" | gal_selftest_hits)" "$(printf '%s\n%s\n' "$GAL_BANNED_SAMPLES" "$GAL_TAB_SAMPLE" | grep -c '')"
# ...and ordinary English is not code: the same words in an HTML comment, in body copy, in a script comment and in a script string.
cat > "$GAL_SCAN_TMP" <<'PROSE'
<!-- Let the team pick. A class of vehicle; const values. -->
<style>/* let the office decide, a class of rule */ .a { color: red; }</style>
<p>let the office decide. A class of vehicle. const values are fine.</p>
<script>
// let the user choose, a class of thing, const x
/* const y = 1 and let z */
var note = 'Let the office decide; a class of vehicle; const x = 1';
var other = "let it be, class is over";
</script>
PROSE
ck "that code scan is not fooled by English: let, class and const in a comment, in body copy and in a string are not code" \
  "$(gal_banned "$GAL_SCAN_TMP" | tr '\n' ' ')" ""
rm -f "$GAL_SCAN_TMP"


# 4b) Open it.
ORIG_VP="$(j "window.innerWidth+'x'+window.innerHeight")"
# Sequenced so that no earlier page can write to the log being read. The app's page logged a connection error 187 ms after
# a clear that ran while it was still alive, and the check blamed the gallery. So: leave the app FIRST, for a blank 404 page
# (the browser refuses about:blank), then clear, then open the gallery. A cleared log can only hold what the gallery did.
bb goto "http://127.0.0.1:$PORT/__gate_blank__" >/dev/null
settle "location.pathname" "/__gate_blank__" 20 >/dev/null
bb console --clear >/dev/null
bb goto "$GAL" >/dev/null
settle "typeof renderDemoRows==='function'&&document.readyState==='complete'?'ready':'no'" "ready" 40 >/dev/null

gck "the gallery page loads and defines renderDemoRows beside the design system's own functions" \
  '[typeof renderDemoRows,typeof icon,typeof figure,typeof V2.openSheet,typeof emptyState].join("/")' \
  "function/function/function/function/function"
ck "the browser logged no console error while the gallery loaded" \
  "$(bb console --errors | grep -c '(no console errors)')" "1"
# The console log does not hold an uncaught exception, so the page keeps its own list (a script at the top of the page).
gck "the page recorded no uncaught script error and no file that failed to load" \
  'Array.isArray(window.__errors)?(window.__errors.length+" errors"+(window.__errors.length?": "+window.__errors.join(" | "):"")):"no error list on the page"' "0 errors"
gck "the gallery loads the design system's own stylesheets and scripts and nothing from the live app" \
  '(function(){var s=[].map.call(document.styleSheets,function(x){return (x.href||"inline").split("/").pop()+(x.href&&x.cssRules.length===0?"(EMPTY)":"")}).sort().join(",");var c=[].map.call(document.scripts,function(x){return x.src?x.src.split("/").pop():"inline"}).sort().join(",");return (document.documentElement.hasAttribute("data-v2")?"data-v2":"NO-data-v2")+" | "+s+" | "+c})()' \
  "data-v2 | components.css,inline,tokens.css | icons.js,inline,inline,overlay.js,states.js"

# 4c) Coverage: every component, in both densities, in every state.
gck "the gallery shows each of the 18 components once" \
  '(function(){var want="@REQ@".split(" "),bad=want.filter(function(n){return document.querySelectorAll("[data-component="+n+"]").length!==1});return bad.length?"missing or repeated: "+bad.join(","):"all "+want.length})()' "all 18"
gck "the gallery has at least the 12 components the plan promised" \
  'document.querySelectorAll("[data-component]").length>=12' "true"
gck "every component has one yard panel and one desk panel, and neither is empty" \
  '(function(){var want="@REQ@".split(" "),bad=[];want.forEach(function(n){["yard","desk"].forEach(function(d){var p=document.querySelectorAll("[data-component="+n+"] [data-density="+d+"]");if(p.length!==1||p[0].children.length===0)bad.push(n+"/"+d)})});return bad.length?bad.join(","):"ok"})()' "ok"
gck "every listed state of every component is drawn in both densities (the list is in this script)" \
  '(function(){var pairs="@STATES@".split(";"),bad=[];pairs.forEach(function(p){var c=p.split("|");["yard","desk"].forEach(function(d){if(document.querySelectorAll("[data-component="+c[0]+"] [data-density="+d+"] "+c[1]).length===0)bad.push(c[0]+"/"+d+": "+c[1])})});return pairs.length<60?"only "+pairs.length+" states listed":(bad.length?"not drawn: "+bad.slice(0,4).join(" ; ")+(bad.length>4?" (+"+(bad.length-4)+" more)":""):"ok")})()' "ok"
gck "every icon in the set is drawn in the yard panel, by name, at a real size" \
  '(function(){var names=Object.keys(ICONS),bad=[];names.forEach(function(n){var c=document.querySelector("[data-component=icons] [data-density=yard] [data-icon="+n+"] svg path");if(!c||c.ownerSVGElement.getBoundingClientRect().width<=0)bad.push(n)});return names.length<25?"only "+names.length+" icons":(bad.length?"undrawn: "+bad.join(","):"ok")})()' "ok"
gck "and none of the drawn icons is the dotted not-found square" \
  '(function(){var n=document.querySelectorAll("[data-component=icons] [data-icon] svg").length;return n<50?"only "+n+" icons drawn":document.querySelectorAll("svg[data-missing]").length+" fallback squares"})()' "0 fallback squares"
gck "the figure samples keep unknown, zero and stale apart: a dash with no digit, a 0, and a value that says how old it is" \
  '(function(){function f(s){return document.querySelector("[data-component=figure] [data-density=yard] [data-sample="+s+"] .figure")}var u=f("unknown"),z=f("zero"),s=f("stale");if(!u||!z||!s)return "sample missing";var ut=u.textContent,zt=z.textContent.replace(/^\s+/,""),st=s.textContent;return [u.getAttribute("data-state")+(/[0-9]/.test(ut)?" has-digit":" no-digit"),z.getAttribute("data-state")+(zt.indexOf("0")===0?" starts-0":" not-0"),s.getAttribute("data-state")+(/Updated 3 hours ago/.test(st)?" aged":" no-age")].join(" / ")})()' \
  "unknown no-digit / value starts-0 / stale aged"

# 4d) No emoji anywhere the page renders (markup, text, attributes, titles).
gck "no emoji or symbol glyph in anything the gallery renders" \
  '(@EMOJI@)(document.documentElement.outerHTML.length>5000?document.documentElement.outerHTML:"🚌")' "none"
gck "that emoji detector can fail (it flags a bus emoji, a sun, a check mark and an arrow, and spares a dash)" \
  '[(@EMOJI@)("🚌"),(@EMOJI@)("☀"),(@EMOJI@)("✔"),(@EMOJI@)("→"),(@EMOJI@)("— - ...")].join(",")' "found,found,found,found,none"

# 4e) Sizes. A yard control under 48px is a missed tap in a glove; a desk row taller than its token is a layout bug.
gck "every yard button, field, select and tab is at least 48px tall" \
  '(function(){var e=document.querySelectorAll("[data-component] [data-density=yard] .btn,[data-component] [data-density=yard] .field,[data-component] [data-density=yard] .select,[data-component] [data-density=yard] [role=tab]"),s=[];for(var i=0;i<e.length;i++){var h=e[i].getBoundingClientRect().height;if(h<48)s.push(e[i].className+" "+h)}return e.length<30?"only "+e.length+" controls found":(s.length?"small: "+s.slice(0,3).join(" | "):"ok")})()' "ok"
gck "every desk button, field, select and tab is at least 32px tall" \
  '(function(){var e=document.querySelectorAll("[data-component] [data-density=desk] .btn,[data-component] [data-density=desk] .field,[data-component] [data-density=desk] .select,[data-component] [data-density=desk] [role=tab]"),s=[];for(var i=0;i<e.length;i++){var h=e[i].getBoundingClientRect().height;if(h<32)s.push(e[i].className+" "+h)}return e.length<30?"only "+e.length+" controls found":(s.length?"small: "+s.slice(0,3).join(" | "):"ok")})()' "ok"
gck "the two densities really differ: no desk button reaches 48px and no yard button is under it" \
  '(function(){function hs(d){return [].map.call(document.querySelectorAll("[data-component] [data-density="+d+"] .btn"),function(x){return x.getBoundingClientRect().height})}var y=hs("yard"),d=hs("desk");if(y.length<10||d.length<10)return "too few buttons "+y.length+"/"+d.length;return (Math.min.apply(null,y)>=48&&Math.max.apply(null,d)<48)?"ok":"yard min "+Math.min.apply(null,y)+" desk max "+Math.max.apply(null,d)})()' "ok"
gck "every yard row is at least 56px and every desk row at least 32px" \
  '(function(){function m(d){var r=document.querySelectorAll("[data-component] [data-density="+d+"] .v2row"),lo=1e9;for(var i=0;i<r.length;i++)lo=Math.min(lo,r[i].getBoundingClientRect().height);return r.length<5?-1:lo}var y=m("yard"),d=m("desk");return (y>=56&&d>=32)?"ok":"yard "+y+" desk "+d+" (-1 means too few rows)"})()' "ok"
gck "the Hindi row asks for Nirmala UI at a 1.7 line height (whether it DRAWS in Nirmala is for the office PC to say)" \
  '(function(){var e=document.querySelector("[data-component=row] [data-density=yard] .v2row[lang=hi]");if(!e)return "no Hindi row";var c=getComputedStyle(e),r=parseFloat(c.lineHeight)/parseFloat(c.fontSize);return c.fontFamily.indexOf("Nirmala UI")===1&&r>1.69&&r<1.71?"ok":c.fontFamily+" "+r})()' "ok"

# 4f) Nothing overflows sideways: the office PC is 1024 wide, the oldest driver phone about 360.
bb viewport 1024x768 >/dev/null
settle "String(window.innerWidth)" "1024" 20 >/dev/null
gck "nothing overflows sideways at 1024 wide" \
  'document.querySelectorAll("[data-component]").length<12?"no gallery on screen":(window.innerWidth!==1024?"viewport is "+window.innerWidth:(document.documentElement.scrollWidth<=1024?"fits":"overflows by "+(document.documentElement.scrollWidth-1024)))' "fits"
bb viewport 360x740 >/dev/null
settle "String(window.innerWidth)" "360" 20 >/dev/null
gck "nothing overflows sideways at 360 wide (an old Android phone)" \
  'document.querySelectorAll("[data-component]").length<12?"no gallery on screen":(window.innerWidth!==360?"viewport is "+window.innerWidth:(document.documentElement.scrollWidth<=360?"fits":"overflows by "+(document.documentElement.scrollWidth-360)))' "fits"
# Back to the size the browser had, for everything after.
GAL_VP="${ORIG_VP:-1280x720}"
bb viewport "$GAL_VP" >/dev/null
settle "String(window.innerWidth)" "${GAL_VP%x*}" 20 >/dev/null

# 4g) The two toggles.
gck "the theme toggle makes the page light, dark, then hands back to the system, and marks the one that is on" \
  '(function(){var h=document.documentElement;function lum(){var m=getComputedStyle(h).backgroundColor.match(/[0-9]+/g);return (+m[0]+ +m[1]+ +m[2])/3}function press(){return [].map.call(document.querySelectorAll("[data-set-theme]"),function(b){return b.getAttribute("aria-pressed")==="true"?b.getAttribute("data-set-theme"):""}).join("")}var o=[];["light","dark","auto"].forEach(function(t){var b=document.querySelector("[data-set-theme="+t+"]");if(!b){o.push("no "+t+" button");return}b.click();o.push(t+":"+(h.getAttribute("data-theme")||"none")+":"+(t==="auto"?"-":(lum()>200?"pale":(lum()<60?"dark":"mid")))+":"+press())});return o.join(" ")})()' \
  "light:light:pale:light dark:dark:dark:dark auto:none:-:auto"
gck "the density toggle shows yard only, desk only, or both, and the panels it hides really are hidden" \
  '(function(){function vis(d){var p=document.querySelectorAll("[data-component] [data-density="+d+"]"),n=0;for(var i=0;i<p.length;i++)if(p[i].getClientRects().length>0)n++;return n+"/"+p.length}var o=[];["yard","desk","both"].forEach(function(v){var b=document.querySelector("[data-set-density="+v+"]");if(!b){o.push("no "+v+" button");return}b.click();o.push(v+"="+vis("yard")+","+vis("desk"))});return o.join(" ")})()' \
  "yard=18/18,0/18 desk=0/18,18/18 both=18/18,18/18"

# 4h) The overlays, opened by the gallery's own buttons, wearing the density and theme of the place they were opened from.
# A person presses a button and Chrome focuses it first; ui/overlay.js reads document.activeElement to learn which panel
# it was opened from. el.click() alone does not focus, so the checks focus the opener first, as a real press does.
gck "a sheet opened from the desk panel is a desk-density, data-v2 dialog and locks the page behind it" \
  '(function(){var b=document.querySelector("[data-component=sheet] [data-density=desk] [data-open=sheet]");if(!b)return "no opener";b.focus();b.click();var d=document.querySelector("dialog.ov-sheet[open]");window.__gopen=d?[d.getAttribute("data-density"),d.hasAttribute("data-v2"),document.documentElement.style.overflow].join("/"):"no sheet opened";return window.__gopen})()' "desk/true/hidden"
j "V2.closeSheet();'x'" >/dev/null
settle "document.querySelector('dialog.ov-modal')?'open':'gone'" "gone" 25 >/dev/null
gck "closing that sheet removes it and gives the page its scroll back" \
  'window.__gopen+" -> "+(document.querySelector("dialog.ov-modal")?"still open":"gone")+", overflow "+(document.documentElement.style.overflow||"restored")' \
  "desk/true/hidden -> gone, overflow restored"
gck "a sheet opened from the yard panel while the page is set to dark is a yard, dark dialog" \
  '(function(){document.querySelector("[data-set-theme=dark]").click();var b=document.querySelector("[data-component=sheet] [data-density=yard] [data-open=sheet-long]");if(!b)return "no opener";b.focus();b.click();var d=document.querySelector("dialog.ov-sheet[open]");window.__gopen=d?[d.getAttribute("data-density"),d.getAttribute("data-theme"),d.querySelectorAll(".v2row").length>5?"long":"short"].join("/"):"no sheet opened";return window.__gopen})()' "yard/dark/long"
j "V2.closeSheet();document.querySelector('[data-set-theme=auto]').click();'x'" >/dev/null
settle "document.querySelector('dialog.ov-modal')?'open':'gone'" "gone" 25 >/dev/null
# The action and the waiting are separate from the assertion, so that what is asserted is what the page ended up as.
j '(function(){var b=document.querySelector("[data-component=confirm] [data-density=yard] [data-open=confirm]");if(!b)return "no opener";b.focus();b.click();var d=document.querySelector("dialog.ov-confirm[open]");if(!d){window.__gconf="no dialog";return "x"}window.__gconf=document.activeElement.className.indexOf("ov-no")>=0?"cancel-focused":"focus on "+document.activeElement.className;d.querySelector(".ov-no").click();return "x"})()' >/dev/null
settle "document.querySelector('dialog.ov-modal')?'open':'gone'" "gone" 25 >/dev/null
gck "a confirmation opens with Cancel focused, and pressing Cancel closes it and releases the scroll lock" \
  'window.__gconf+" -> "+(document.querySelector("dialog.ov-modal")?"still open":"closed")+", "+(document.documentElement.style.overflow||"unlocked")' "cancel-focused -> closed, unlocked"
gck "the gallery's readout says the cancelled confirmation answered no" \
  '(function(){var l=document.querySelector("[data-component=confirm] [data-density=yard] [data-log]");return l?l.textContent:"no readout"})()' "Last answer: No"
gck "a dangerous confirmation draws a danger Confirm button, and pressing it is answered yes" \
  '(function(){var b=document.querySelector("[data-component=confirm] [data-density=desk] [data-open=confirm-danger]");if(!b)return "no opener";b.click();var y=document.querySelector("dialog.ov-confirm[open] .ov-yes");if(!y)return "no dialog";var k=y.classList.contains("btn-danger")?"danger":"not-danger";y.click();return k})()' "danger"
settle "document.querySelector('dialog.ov-modal')?'open':'gone'" "gone" 25 >/dev/null
gck "and the desk panel's readout says yes" \
  '(function(){var l=document.querySelector("[data-component=confirm] [data-density=desk] [data-log]");return l?l.textContent:"no readout"})()' "Last answer: Yes"
gck "an error toast says Error in words, does not take focus, and its Close button is there" \
  '(function(){var b=document.querySelector("[data-component=toast] [data-density=yard] [data-open=toast-bad]");if(!b)return "no opener";var before=document.activeElement;b.click();var t=document.querySelector(".ov-toast-bad");if(!t)return "no toast";var k=t.querySelector(".ov-toast-kind").textContent.replace(/\s+/g,"");var f=(document.activeElement===before||document.activeElement===document.body)?"no-focus-taken":"FOCUS TAKEN";var c=t.querySelector(".ov-toast-close");if(!c)return k+" no close button";c.click();window.__gtoast=k+" "+f;return window.__gtoast})()' "Error no-focus-taken"
settle "document.querySelector('.ov-toast')?'there':'gone'" "gone" 25 >/dev/null
gck "once Close is pressed the toast goes, and no overlay or scroll lock is left behind" \
  'window.__gtoast+" -> "+(document.querySelector(".ov-toast")?"toast left":"toast gone")+", "+(document.querySelector("dialog.ov-modal")?"modal left":"no modal")+", "+(document.documentElement.style.overflow||"unlocked")' "Error no-focus-taken -> toast gone, no modal, unlocked"

# 4i) The performance budget. The timing includes the browser laying the rows out (reading offsetHeight forces it),
# because appending 200 nodes is nearly free and the cost the office PC pays is style and layout.
#
# 250 ms is a PLACEHOLDER for the desk budget, set on a developer machine. The real number comes from opening this
# gallery on an office PC (Windows 7, Chrome 109) and pressing "Draw 200 rows": it shows three runs on screen. Until
# those results arrive the threshold means only "not absurdly slow here". TIGHTEN IT to the office PC's result, with
# whatever margin the owner chooses, as soon as it is known.
gck "#perf-bed starts empty, and is a desk-density container (so the rows timed below are desk rows)" \
  '(function(){var b=document.getElementById("perf-bed");return b?(b.children.length===0?"empty":"has "+b.children.length+" children")+", --row-h "+getComputedStyle(b).getPropertyValue("--row-h").replace(/\s/g,""):"no bed"})()' "empty, --row-h 32px"
# Three runs, the fastest counts: this machine is shared with other work, and a scheduling hiccup only ever makes a run
# slower, so a budget that fails on one slow run of three would block pushes at random. Every run must still have drawn
# 200 rows into the bed and given it a height, and EVERY one of the 200 must hold a drawing, a figure, a badge and a button:
# bare divs would satisfy the min-height token and time nothing a real list does, and checking one row would let 199 bare
# ones through. The walk happens after the clock has stopped, so it adds nothing to the time. Otherwise there is no reading.
PERF_RUNS="$(j '(function(){var bed=document.getElementById("perf-bed");if(!bed||bed.children.length)return "";var out=[],r;for(r=0;r<3;r++){bed.innerHTML="";var t=performance.now(),n=renderDemoRows(200),h=bed.offsetHeight,ms=performance.now()-t;var rows=[].slice.call(bed.children),full=rows.filter(function(x){return x.classList.contains("v2row")&&x.querySelector("svg")&&x.querySelector(".figure")&&x.querySelector(".badge")&&x.querySelector(".btn")}).length;if(n!==200||full!==200||h<=0)return "";out.push(Math.round(ms*10)/10)}return out.join(" ")})()')"
echo "    (200 demo rows drawn and laid out, three runs: ${PERF_RUNS:-no reading} ms; limit 250 on the fastest)"
PERF_AWK='BEGIN { n = split(r, a, " "); if (n != 3) { print "no reading"; exit } m = a[1] + 0; for (i = 2; i <= 3; i++) if (a[i] + 0 < m) m = a[i] + 0; print (m < 250) ? "ok" : "slow: fastest " m " ms" }'
ck "200 rows render inside the desk budget (the fastest of three runs; each drew 200 rows into the bed, every one with a drawing, figure, badge and button)" \
  "$(awk -v r="$PERF_RUNS" "$PERF_AWK")" "ok"
gck "the gallery's own Draw 200 rows button leaves 200 rows in the bed and reports three timed runs" \
  '(function(){var b=document.querySelector("[data-act=perf]");if(!b)return "no button";b.click();var r=document.getElementById("perf-readout"),n=document.querySelectorAll("#perf-bed > .v2row").length;return n+" rows; "+(/run 1 [0-9.]+ ms.*run 2 [0-9.]+ ms.*run 3 [0-9.]+ ms/.test(r?r.textContent:"")?"three runs shown":"readout: "+(r?r.textContent:"missing"))})()' "200 rows; three runs shown"
# ── end of the gallery block ──

echo "──"
echo "RESULT: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  echo "❌ g-saathi gate FAILED — fix the above, or bypass with: git push --no-verify"
  exit 1
fi
echo "✅ g-saathi gate passed — deploy allowed"
exit 0

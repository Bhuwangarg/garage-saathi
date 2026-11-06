/* Tests for v2/caps.js and v2/router.js. Run: node test_v2_router.js
 *
 * At the repo ROOT and not in v2/, because scripts/run-tests.py auto-discovers
 * test_*.js at the root only and does not recurse: a test in v2/ would never
 * run, and a test nobody runs is not a test.
 *
 * This suite exists for one rule (DECISIONS.md §3, v2-ux.md §4.3):
 *
 *   a screen declares the capability it needs, and a screen that declares
 *   nothing is unreachable by everybody, including the owner.
 *
 * v1 defaulted the other way and leaked six times by it — `purchases`,
 * `company`, `scorecard`, `history`, `outsidejobs` and `gatepass` each had no
 * entry in `ROUTE_PERM` and were therefore open to every signed-in role. So
 * the first case below ADDS a fourteenth screen with no declaration and proves
 * nobody can reach it, because the defect v2 is preventing is the one that
 * arrives in a year with a new screen and no permission beside it.
 *
 * The expected (role x screen) table on line ~90 is TRANSCRIBED FROM THE SPECS,
 * not computed from caps.js. That is the point of it: a table derived from the
 * implementation asserts what the code does, and this one asserts what
 * v2-ux.md §4.2/§4.4 and screens-shell.md §1.3 say.
 */
process.env.TZ = process.env.TZ || 'UTC';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CAPS_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'caps.js'), 'utf8');
const ROUTER_SRC = fs.readFileSync(path.join(ROOT, 'v2', 'router.js'), 'utf8');

let fails = 0;
function check(name, cond) { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; }

const Caps = require('./v2/caps.js');
global.Caps = Caps;
const Router = require('./v2/router.js');

/* The overlay, stubbed as a counter and installed BEFORE the first `go()`
 * rather than beside the case that asserts on it. Two reasons, both learned
 * from a mutation run: a refusal that reaches for `V2.toast` when there is no
 * `V2` throws, which kills the suite before the grep check that guards the same
 * absence ever runs; and a toast raised by any of the ~100 refusals below — not
 * only the one case that looks for it — must count. screens-money-people.md
 * §0.1: "No toast — a message about a screen nobody asked for is noise." */
let toasts = 0;
global.V2 = {
  toast: function () { toasts++; },
  okToast: function () { toasts++; },
  errToast: function () { toasts++; },
  confirmDialog: function () { toasts++; },
  openSheet: function () { toasts++; },
};

/* The eight roles. v2_perms.py's ALL_ROLES, which is the server's own list —
 * the client's table and the server's read scope must be over the same eight or
 * one of them is enforcing a policy nobody decided (LIVE-ISSUES 6). */
const ROLES = ['owner', 'supervisor', 'crewmanager', 'office',
               'store', 'mechanic', 'driver', 'conductor'];

const SCREEN_IDS = Object.keys(Caps.SCREENS);

/* Signing in, for the router. `S.user` is F2's; router.js reads it at call
 * time, so one module serves all eight roles here. */
function signIn(role) { global.S = role ? { user: { role: role } } : { user: null }; }

/* Every screen module registered, so that a `go()` refusal below is about the
 * DECLARATION and never about a missing module. The three-way refusal is tested
 * separately further down. */
function registerAll() {
  Router._reset();
  SCREEN_IDS.forEach(function (id) {
    Router.register(id, { render: function () { return ''; } });
  });
}

/* ---------------------------------------------------------------------- *
 * The expected table, from the specs.
 *
 * v2-ux.md §4.2 (front doors) and §4.4 (slots), screens-shell.md §1.3:
 *   driver      Me only                       1
 *   conductor   Me only                       1
 *   mechanic    Today, Jobs, Store, Me        4 tabs, 5 destinations w/ the card
 *   store       Today, Store, Jobs, Fuel, Me  5 tabs, 6 destinations w/ the card
 *   crewmanager Today, Duty, People, Fuel, Reviews, Me   6
 *   office      Today, People, Reviews, Me    4
 *   supervisor  all twelve
 *   owner       all twelve
 * `jobcard` is held wherever `jobs` is: it declares `viewJobs` too and is
 * reached from Jobs (DECISIONS.md §15, screens-shell.md §1.3).
 * ---------------------------------------------------------------------- */
const ALL13 = ['today', 'attention', 'jobs', 'jobcard', 'buses', 'store', 'money',
               'people', 'duty', 'gate', 'fuel', 'reviews', 'me'];
const EXPECTED = {
  owner: ALL13,
  supervisor: ALL13,
  store: ['today', 'jobs', 'jobcard', 'store', 'fuel', 'me'],
  mechanic: ['today', 'jobs', 'jobcard', 'store', 'me'],
  crewmanager: ['today', 'people', 'duty', 'fuel', 'reviews', 'me'],
  office: ['today', 'people', 'reviews', 'me'],
  driver: ['me'],
  conductor: ['me'],
};

// The nav slot orders the specs give, which are NOT rail order for two roles.
const EXPECTED_YARD = {
  owner: ['today', 'attention', 'money', 'buses', 'more', 'me'],
  supervisor: ['today', 'attention', 'jobs', 'buses', 'more', 'me'],
  mechanic: ['today', 'jobs', 'store', 'me'],
  store: ['today', 'store', 'jobs', 'fuel', 'me'],
  crewmanager: ['today', 'duty', 'people', 'fuel', 'reviews', 'me'],
  office: ['today', 'people', 'reviews', 'me'],
  driver: [],
  conductor: [],
};
const EXPECTED_MORE = {
  owner: ['jobs', 'store', 'people', 'duty', 'gate', 'fuel', 'reviews'],
  supervisor: ['store', 'money', 'people', 'duty', 'gate', 'fuel', 'reviews'],
};

function ids(list) { return list.map(function (x) { return x.id; }); }
function same(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }

function main() {
  /* ================================================================== *
   * 1. A screen that declares nothing is unreachable for ALL EIGHT
   *    roles, including the owner. The v1 defect, in the only form that
   *    can fail.
   *
   *    Red when you: default an unknown or empty declaration to allow.
   * ================================================================== */
  const GHOSTS = {
    // The literal case the brief asks for: a screen added in a year with an
    // empty declaration.
    ghostEmpty: { title: 'Ghost', word: 'xGhost', order: 99, nav: true, mark: 'warn',
                  declares: [], gates: [] },
    // The likelier case: somebody forgot the key altogether.
    ghostMissing: { title: 'Ghost', word: 'xGhost', order: 98, nav: true, mark: 'warn',
                    gates: [] },
    // "Open by design" with the reason dropped — the sentinel used as a
    // shortcut past the rule it exists to keep.
    ghostNoReason: { title: 'Ghost', word: 'xGhost', order: 97, nav: true, mark: 'warn',
                     declares: Caps.OPEN_BY_DESIGN, openTo: 'everybody', gates: [] },
    // A declaration naming a capability nobody holds and that is not in PERMS.
    ghostUnknownCap: { title: 'Ghost', word: 'xGhost', order: 96, nav: true, mark: 'warn',
                       declares: ['viewEverything'], gates: [] },
  };
  Object.keys(GHOSTS).forEach(function (gid) { Caps.SCREENS[gid] = GHOSTS[gid]; });
  registerAll();
  Object.keys(GHOSTS).forEach(function (gid) {
    Router.register(gid, { render: function () { return ''; } });
  });

  Object.keys(GHOSTS).forEach(function (gid) {
    let openTo = [];
    ROLES.forEach(function (r) {
      signIn(r);
      const held = Caps.holds(r, gid);
      const inScreens = Caps.screensFor(r).indexOf(gid) !== -1;
      const n = Caps.navFor(r, 'yard');
      const inNav = ids(n.items).concat(ids(n.more)).indexOf(gid) !== -1;
      const went = Router.go(gid);
      if (held || inScreens || inNav || went) openTo.push(r);
    });
    check(gid + ' is unreachable for all eight roles including owner'
          + (openTo.length ? ' (reachable by: ' + openTo.join(', ') + ')' : ''),
          openTo.length === 0);
  });
  // And the route did not move while all that was being refused.
  signIn('owner');
  check('…and no refusal above moved the route', Router.current().id === null);
  Object.keys(GHOSTS).forEach(function (gid) { delete Caps.SCREENS[gid]; });

  /* A screen id that is not in SCREENS at all cannot even be registered, so
   * there is no way to introduce a fourteenth screen without a declaration. */
  registerAll();
  check('a screen id absent from SCREENS cannot register',
        Router.register('somethingNew', { render: function () { return ''; } }) === false);
  signIn('owner');
  check('…and is unreachable for the owner', Router.go('somethingNew') === false);

  /* ================================================================== *
   * 2. Exactly TWO screens carry OPEN_BY_DESIGN, each with a non-empty
   *    reason. A third is a leak taking the shape of v1's six.
   *
   *    Red when you: add a third quietly, or drop the reason.
   * ================================================================== */
  const open = SCREEN_IDS.filter(function (id) {
    return Caps.SCREENS[id].declares === Caps.OPEN_BY_DESIGN;
  });
  check('exactly two screens are OPEN_BY_DESIGN (got ' + open.length + ': ' + open.join(', ') + ')',
        open.length === 2);
  check('…and they are today and me', same(open.slice().sort(), ['me', 'today']));
  check('…each with a non-empty reason beside it',
        open.every(function (id) {
          const r = Caps.SCREENS[id].openReason;
          return typeof r === 'string' && r.trim().length > 0;
        }));
  /* Thirteen screens, twelve destinations: `jobcard` has nav:false and is
   * reached from Jobs (DECISIONS.md §15). */
  check('thirteen screens', SCREEN_IDS.length === 13);
  check('…twelve destinations, and jobcard is the one that is not one',
        SCREEN_IDS.filter(function (id) { return Caps.SCREENS[id].nav; }).length === 12
        && Caps.SCREENS.jobcard.nav === false
        && Caps.SCREENS.jobcard.parent === 'jobs');
  // One name, three places (screens-shell.md §1.6): no two screens share a
  // title, and every screen has one.
  const titles = SCREEN_IDS.map(function (id) { return Caps.SCREENS[id].title; });
  check('every screen has a title and no two share one',
        titles.every(function (t) { return !!t; })
        && new Set(titles).size === titles.length);
  check('"More" is never a screen id', !Caps.SCREENS.more);

  /* ================================================================== *
   * 3. 8 roles x 13 screens, both directions, against the specs' own
   *    table: Router.go(id) false <=> screensFor omits id <=> navFor
   *    omits it.
   *
   *    Two documented exceptions to the third clause, each cited:
   *      - `jobcard` is nav:false and is reached from Jobs, so it is held
   *        and is in no nav for anybody (DECISIONS.md §15);
   *      - `driver` and `conductor` have ONE destination and therefore no
   *        nav at all, so `me` is held and is in no nav
   *        (screens-shell.md §1.4.1).
   *
   *    Red when you: let the nav and the declaration disagree, which is
   *    LIVE-ISSUES 6 exactly.
   * ================================================================== */
  let mismatch = [];
  let navMismatch = [];
  ROLES.forEach(function (role) {
    const expect = EXPECTED[role];
    signIn(role);
    registerAll();
    const got = Caps.screensFor(role);
    if (!same(got, expect.slice().sort(function (a, b) {
      return Caps.SCREENS[a].order - Caps.SCREENS[b].order;
    }))) mismatch.push(role + ': screensFor=' + got.join(',') + ' expected=' + expect.join(','));

    const n = Caps.navFor(role, 'yard');
    const navIds = ids(n.items).concat(ids(n.more)).filter(function (id) { return id !== 'more'; });
    const noNav = role === 'driver' || role === 'conductor';

    SCREEN_IDS.forEach(function (id) {
      const want = expect.indexOf(id) !== -1;
      // direction 1: the declaration
      if (Caps.holds(role, id) !== want) mismatch.push(role + ' x ' + id + ' holds');
      // direction 2: the route
      Router._reset();
      SCREEN_IDS.forEach(function (sid) {
        Router.register(sid, { render: function () { return ''; } });
      });
      if (Router.go(id) !== want) mismatch.push(role + ' x ' + id + ' go');
      // direction 3: the nav, with the two cited exceptions
      const inNav = navIds.indexOf(id) !== -1;
      const wantNav = want && Caps.SCREENS[id].nav && !noNav;
      if (inNav !== wantNav) navMismatch.push(role + ' x ' + id + ' nav');
    });
  });
  check('8 roles x 13 screens: the declaration and the route agree'
        + (mismatch.length ? ' — ' + mismatch.slice(0, 6).join('; ') : ''),
        mismatch.length === 0);
  check('…and the nav agrees with both, jobcard and the no-nav roles aside'
        + (navMismatch.length ? ' — ' + navMismatch.slice(0, 6).join('; ') : ''),
        navMismatch.length === 0);

  /* The two exceptions, asserted rather than assumed, so that neither can be
   * quietly widened into a third. */
  signIn('owner');
  check('jobcard is held by the owner and is in no nav',
        Caps.holds('owner', 'jobcard')
        && ids(Caps.navFor('owner', 'desk').items).indexOf('jobcard') === -1);
  ['driver', 'conductor'].forEach(function (r) {
    check(r + ' holds zero capabilities', Caps.capsOf(r).length === 0);
    check(r + ' reaches exactly Me, at both densities',
          same(Caps.screensFor(r), ['me'])
          && Caps.navFor(r, 'yard').items.length === 0
          && Caps.navFor(r, 'desk').items.length === 0);
  });
  // A signed-out device holds nothing. Deny by default, not by ordering.
  signIn(null);
  check('a signed-out device reaches no screen',
        Caps.screensFor(null).length === 0 && Router.go('me') === false);

  /* ================================================================== *
   * 4. Every capability a role holds is reachable from at least one
   *    screen that role holds — v2-ux.md §4.4's "no capability is held
   *    without a path", the falsifiable form of it.
   *
   *    `Caps.RETIRED` is the named exception list, and the check asserts
   *    the computed orphans EQUAL it: a new orphan reddens this, and so
   *    does giving a listed one a home without delisting it.
   *
   *    Red when you: drop a screen from a role's nav and leave the
   *    capability (a supervisor holds 16 such capabilities in v1).
   * ================================================================== */
  const orphans = {};
  ROLES.forEach(function (role) {
    const reach = Caps.screensFor(role);
    const used = {};
    reach.forEach(function (id) {
      const s = Caps.SCREENS[id];
      const d = Array.isArray(s.declares) ? s.declares : [];
      d.concat(s.gates || []).forEach(function (c) { used[c] = true; });
    });
    Caps.capsOf(role).forEach(function (cap) {
      if (!used[cap]) (orphans[cap] || (orphans[cap] = [])).push(role);
    });
  });
  const orphanKeys = Object.keys(orphans).sort();
  const retiredKeys = Object.keys(Caps.RETIRED).sort();
  check('no capability is held without a path, beyond the named retired ones'
        + ' (orphans: ' + (orphanKeys.join(',') || 'none') + ')',
        same(orphanKeys, retiredKeys)
        && orphanKeys.every(function (c) {
          return same(orphans[c].slice().sort(), Caps.RETIRED[c].slice().sort());
        }));
  /* And every retired entry says WHY, by citing the spec line that retires it,
   * inside the RETIRED block itself — an exception list with no citation is a
   * suppression, and this check is the difference between the two. */
  const retiredBlock = CAPS_SRC.slice(CAPS_SRC.indexOf('const RETIRED = {'),
                                      CAPS_SRC.indexOf('function holds('));
  check('…and each retired capability is named with the line that retires it',
        retiredKeys.length > 0 && retiredKeys.every(function (c) {
          const i = retiredBlock.indexOf(c + ': [');
          return i > 0 && /§5\.2/.test(retiredBlock.slice(Math.max(0, i - 500), i));
        }));
  /* Every capability a SCREEN names must exist in PERMS. A gate on a
   * capability nobody can hold is a control nobody can ever use, which reads
   * as a dead end and is how [E] 8db78e7 looked from the outside. */
  let unknown = [];
  SCREEN_IDS.forEach(function (id) {
    const s = Caps.SCREENS[id];
    const d = Array.isArray(s.declares) ? s.declares : [];
    d.concat(s.gates || []).forEach(function (c) {
      if (!Caps.PERMS[c]) unknown.push(id + ':' + c);
    });
  });
  check('every capability a screen declares or gates on exists in PERMS'
        + (unknown.length ? ' — ' + unknown.join(', ') : ''), unknown.length === 0);

  /* ================================================================== *
   * 5. Owner and supervisor: 5 yard slots + 7 More rows = 12
   *    destinations, no duplicate, no aria-current on More; at desk 12
   *    items and NO More at all.
   *
   *    Red when you: add a thirteenth destination, or leave More in the
   *    rail.
   * ================================================================== */
  ['owner', 'supervisor'].forEach(function (role) {
    signIn(role);
    const yard = Caps.navFor(role, 'yard');
    const desk = Caps.navFor(role, 'desk');
    check(role + ' yard: the slot order the specs give',
          same(ids(yard.items), EXPECTED_YARD[role]));
    check(role + ' yard: the seven More rows, in rail order',
          same(ids(yard.more), EXPECTED_MORE[role]));
    const dests = ids(yard.items).filter(function (i) { return i !== 'more'; })
      .concat(ids(yard.more));
    check(role + ' yard: 5 slots + 7 More = 12 destinations, no duplicate',
          dests.length === 12 && new Set(dests).size === 12);
    check(role + ' desk: all 12 items in rail order and no More at all',
          desk.more.length === 0 && desk.items.length === 12
          && ids(desk.items).indexOf('more') === -1
          && same(ids(desk.items), ['today', 'attention', 'jobs', 'buses', 'store',
                                    'money', 'people', 'duty', 'gate', 'fuel',
                                    'reviews', 'me']));
    /* More is never a destination (screens-shell.md §1.3): it is not a screen,
     * so `aria-current` can never land on it — nav() sets that from the active
     * route id, and no route is ever 'more'. Asserted at the source of that
     * guarantee rather than in the markup. */
    check(role + ": More is not a screen, so no route can ever make it current",
          !Caps.SCREENS.more && Router.go('more') === false);
  });
  // The roles whose whole list fits: no More anywhere, either density.
  ['mechanic', 'store', 'crewmanager', 'office'].forEach(function (role) {
    signIn(role);
    const yard = Caps.navFor(role, 'yard');
    check(role + ': ' + EXPECTED_YARD[role].length + ' slots, no More, either density',
          same(ids(yard.items), EXPECTED_YARD[role]) && yard.more.length === 0
          && Caps.navFor(role, 'desk').more.length === 0
          && ids(yard.items).indexOf('more') === -1);
  });
  // Six is the ceiling at phone width (screens-shell.md §1.3.1).
  check('no role is given more than six yard slots',
        ROLES.every(function (r) { signIn(r); return Caps.navFor(r, 'yard').items.length <= 6; }));

  /* ================================================================== *
   * 6. Router.go to an unheld screen leaves current() unchanged and
   *    queues no toast.
   *
   *    Red when you: navigate first and check after.
   * ================================================================== */
  signIn('office');
  registerAll();
  let moved = [];
  Router.onChange(function (r) { moved.push(r.id); });
  check('a held screen resolves', Router.go('people') === true);
  const before = Router.current();
  const movesBefore = moved.length;
  check('an unheld screen is refused', Router.go('money') === false);
  const after = Router.current();
  check('…and current() is unchanged', after.id === before.id && before.id === 'people');
  /* And it never moved, not even for an instant. "Navigate first and check
   * after" leaves `current()` looking right by the time anybody asks, so the
   * falsifiable form is the NOTIFICATION: a refused route that told the shell
   * to redraw has already drawn a screen this person may not see. */
  check('…and no onChange fired, so the shell was never told to draw it',
        moved.length === movesBefore);
  check('…and nothing was said to the person, here or in any refusal above',
        toasts === 0);
  check('…and the refusal did not throw', true);
  /* The absence, grepped, because an absence is the one thing a behavioural
   * test cannot keep: the next person adds a toast and every case above still
   * passes. Comments are stripped first, for the reason check-floor.py strips
   * them — this file's own prose says "no toast" and a checker that cannot tell
   * a call from prose about it teaches people to delete checks. */
  const bare = ROUTER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('router.js makes no toast, confirm or alert call at all',
        !/\b(toast|okToast|errToast|confirmDialog|confirm|alert)\s*\(/.test(bare));
  /* And no URL routing (v2-ux.md §2.1). A `location` or `pushState` here would
   * create the deep link this design does not have, and a deep link is a second
   * door into a screen — the door the declaration check cannot see. */
  check('router.js reads no URL and writes no history',
        !/\b(location|pushState|replaceState|hashchange|popstate)\b/.test(bare));

  /* ================================================================== *
   * 7. The third way a screen is unreachable: its module never
   *    registered. Same answer as an unheld screen, for the same reason.
   * ================================================================== */
  Router._reset();
  signIn('owner');
  check('an unregistered screen is unreachable even for the owner',
        Caps.holds('owner', 'money') === true && Router.go('money') === false);
  check('a module with no render is refused',
        Router.register('money', { mount: function () {} }) === false
        && Router.go('money') === false);
  check('…and with one it resolves',
        Router.register('money', { render: function () { return ''; } }) === true
        && Router.go('money') === true);

  /* ================================================================== *
   * 8. The one-deep back stack, and params.
   * ================================================================== */
  registerAll();
  signIn('supervisor');
  check('back() from a nav screen goes nowhere',
        Router.go('jobs') === true && Router.back() === false
        && Router.current().id === 'jobs');
  check('jobs -> jobcard -> back lands on jobs',
        Router.go('jobcard', { id: 'jc-1' }) === true
        && Router.current().id === 'jobcard'
        && Router.current().params.id === 'jc-1'
        && Router.back() === true && Router.current().id === 'jobs');
  check('a sideways nav move clears the stack, so back() does not walk history',
        Router.go('jobcard', { id: 'jc-2' }) === true && Router.go('buses') === true
        && Router.back() === false && Router.current().id === 'buses');
  const snap = Router.current();
  snap.params = { tampered: true };
  check('current() hands out a copy, not the route itself',
        Router.current().params === null || !Router.current().params.tampered);
  let changes = [];
  Router.onChange(function (r) { changes.push(r.id); });
  Router.onChange(function () { throw new Error('a listener that throws'); });
  Router.go('store');
  check('onChange fires with the new route and survives a throwing listener',
        changes.length === 1 && changes[0] === 'store' && Router.current().id === 'store');

  /* ================================================================== *
   * 9. The table itself: 45 capabilities -- v1's 37 transcribed, the four v2
   *    names, and closeJob + moveJobBus, with v1's exact role lists.
   *
   *    This said 41 until slice W found that `mayCloseJob` and `changeJobBus`
   *    were never capabilities at all: v1's is a role helper (app.js:3887) and
   *    the bus move is a bare role test on the server, so Caps.can() answered
   *    false for everybody and the close button would have been absent for the
   *    two people who hold it. Both are minted from the SERVER's rules
   *    (sync_server.py:1760 and :1702) and gated on the Job card.
   * ================================================================== */
  const caps = Object.keys(Caps.PERMS);
  check('45 capabilities: v1\'s 37, four v2 names, and the four minted from the '
        + 'server\'s own rules -- closeJob, moveJobBus, editFuelFill, '
        + 'writeBusOdometer (got ' + caps.length + ')', caps.length === 45);
  /* Each minted one is checked against the server line it came from, not just
   * counted -- a count notices a capability appearing and says nothing about
   * whether its role list is right, which is the half that leaks. */
  check('editFuelFill is owner and supervisor: a fill is append-only for everyone else',
        Caps.PERMS.editFuelFill.slice().sort().join(',') === 'owner,supervisor');
  check('writeBusOdometer mirrors WRITE_ROLES[buses], which is two roles',
        Caps.PERMS.writeBusOdometer.slice().sort().join(',') === 'owner,supervisor');
  ['closeJob', 'moveJobBus'].forEach(function (c) {
    check('the minted capability ' + c + ' exists and is role-scoped',
          Array.isArray(Caps.PERMS[c]) && Caps.PERMS[c].length > 0);
  });
  check('closeJob is the owner and the supervisor, as the server says',
        Caps.PERMS.closeJob.slice().sort().join(',') === 'owner,supervisor');
  check('moveJobBus is the owner alone, as the server says',
        Caps.PERMS.moveJobBus.slice().sort().join(',') === 'owner');
  ['viewAttention', 'viewSpendTotals', 'viewCompanyBilling', 'viewAdoption']
    .forEach(function (c) { check('the v2 name ' + c + ' exists', !!Caps.PERMS[c]); });
  /* Transcription, checked against v1's own source rather than against my
   * reading of it: every capability name in app.js's PERMS is here, with the
   * same role list, except the one departure that is marked in caps.js.
   * `gateCheck` loses `driver` — DECISIONS.md §7 moves the departure check to
   * the supervisor and v2-ux.md §4.2 states the consequence: "a driver holds
   * zero capabilities". Leaving it would open Duty board and Gate round to a
   * driver's login, which is LIVE-ISSUES 2's shape created by a transcription.
   */
  const V1 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const block = V1.slice(V1.indexOf('const PERMS = {'));
  const v1perms = {};
  const re = /^\s{2}([A-Za-z]+):\s*\[([^\]]*)\]/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    v1perms[m[1]] = m[2].split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); })
      .filter(Boolean);
    if (m[1] === 'viewScoreboard') break;   // the last entry in v1's table
  }
  check('v1\'s PERMS parsed from app.js (37 names)', Object.keys(v1perms).length === 37);
  const DEPARTURES = { gateCheck: ['owner', 'supervisor'] };
  let drift = [];
  Object.keys(v1perms).forEach(function (cap) {
    const want = DEPARTURES[cap] || v1perms[cap];
    const got = Caps.PERMS[cap];
    if (!got || !same(got.slice().sort(), want.slice().sort())) {
      drift.push(cap + ': ' + (got ? got.join('|') : 'MISSING') + ' vs ' + want.join('|'));
    }
  });
  check('every v1 capability is transcribed with v1\'s role list'
        + (drift.length ? ' — ' + drift.join('; ') : ''), drift.length === 0);
  check('the one departure is gateCheck losing driver, and nothing else',
        Caps.can('driver', 'gateCheck') === false
        && Caps.can('supervisor', 'gateCheck') === true
        && v1perms.gateCheck.indexOf('driver') !== -1);
  // Deny by default, three ways.
  check('can() denies an unknown capability, a null role and an unlisted role',
        Caps.can('owner', 'viewEverything') === false
        && Caps.can(null, 'money') === false
        && Caps.can('conductor', 'money') === false);

  /* ================================================================== *
   * 10. caps.js is data and one predicate: no DOM.
   * ================================================================== */
  const capsBare = CAPS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('caps.js touches no DOM',
        !/\b(document|querySelector|innerHTML|insertAdjacentHTML|addEventListener|createElement)\b/
          .test(capsBare));
  check('caps.js reads no store and no clock',
        !/\b(DB|indexedDB|Date\.now|fetch|localStorage)\b/.test(capsBare));

  // Last, over the whole run: not one of the roughly hundred refusals above
  // said anything to anybody.
  check('no refusal anywhere in this suite raised a toast, sheet or dialog',
        toasts === 0);

  console.log(fails ? `\n${fails} FAILED` : '\nall ok');
  process.exit(fails ? 1 : 0);
}

main();

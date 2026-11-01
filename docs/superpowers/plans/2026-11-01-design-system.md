# Garage Saathi v2 Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the token, icon and component layer that the 14 v2 screens are drawn from, plus a gallery page that can be opened on an office PC to prove it works on the hardware that has to run it.

**Architecture:** A new `ui/` directory, entirely additive — `styles.css`, `app.js` and the live app are not touched by this plan, so the running system is unaffected and nothing needs cutting over. Three files carry the system: `ui/tokens.css` (colour, type, spacing, density), `ui/icons.js` (the ~25 inline SVGs and an `icon()` helper replacing 968 emoji), `ui/components.css` (the component layer). `ui/gallery.html` renders every component in every state in both densities and both themes, and doubles as the test fixture. Correctness that can be checked mechanically is checked by node tests rather than by eye.

**Tech Stack:** Plain CSS and plain ES5-compatible JavaScript. No build step, no framework, no dependencies, no webfonts. Node is used only to run tests.

**Spec:** `docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md`

## Global Constraints

Every task's requirements implicitly include these. Values are copied from the spec.

- **Browser floor is Chrome 109.** Never use: `oklch()`, `color-mix()`, CSS nesting, `@starting-style`, view transitions, the popover API, `subgrid`, `text-wrap: balance`. Permitted and used: `:has()`, container queries, grid, `@layer`, `aspect-ratio`, `gap` in flex, `tabular-nums`, `dialog`.
- **No polyfills.** A polyfill is JavaScript, and JavaScript is the expensive thing on this hardware.
- **No emoji anywhere in `ui/`.** Windows 7 lacks the glyphs. Icons are inline SVG only.
- **Fonts:** `--font: -apple-system, "Segoe UI", Roboto, system-ui, Arial, sans-serif`. `--font-hi: "Nirmala UI", "Segoe UI", Mangal, sans-serif` — Nirmala before Mangal, because Windows 7 ships both and defaults Devanagari to the worse one.
- **Colour is authored in HSL** and hand-tuned; no generated palette.
- **Status is never colour alone** — every status carries a word or a mark.
- **Two densities** from one component set: yard (48px minimum touch target) and desk (32px rows). Desk baseline viewport is **1024×768**.
- **Motion:** only `transform` and `opacity`; `ease-out` for entering; `ease-in` never; nothing over 300ms; press feedback 100–160ms at `scale(0.97)`; navigation, lists and tab switches do not animate; `prefers-reduced-motion` removes movement and keeps opacity.
- **All figures use `font-variant-numeric: tabular-nums`.**
- Run tests with `node <file>`; this repo's suites are plain node scripts that exit non-zero on failure (see `test_duty.js`).

## Review Focus

Failure modes the spec implies that no task's happy path exercises. Each has a test added to the task that owns the code.

1. **A token with no dark-mode value** renders invisible text on a dark screen — every semantic token must resolve in both themes (Task 1).
2. **An unknown icon name** must render a visible fallback mark, not nothing — a missing icon that silently draws zero pixels is how a button becomes unlabelled (Task 2).
3. **Devanagari text** must not clip or fall back to Mangal — Hindi is a first-class language here and its line-height differs from Latin (Task 3).
4. **An overlong value** — a 30-character crew name or a malformed registration — must truncate or wrap, never push a row's actions off screen (Task 3).
5. **Unknown versus zero** — a figure that has no value shows `—`, a figure that is genuinely zero shows `0`, and a stale figure says when it was last true. Conflating them is how an owner reads "no challans" as "none outstanding" (Task 4).

---

### Task 1: Token layer

**Files:**
- Create: `ui/tokens.css`
- Test: `test_ui_tokens.js`

**Interfaces:**
- Produces: CSS custom properties on `:root` — colour `--ink`, `--ink-dim`, `--surface`, `--surface-raised`, `--line`, `--accent`, `--accent-ink`, `--ok`, `--warn`, `--bad`; type `--font`, `--font-hi`, `--t1`…`--t6`; spacing `--s1`…`--s8` on a 4px scale; density `--row-h`, `--tap`, `--pad`. Dark values under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`. Density via `[data-density="yard"]` and `[data-density="desk"]`.

- [ ] **Step 1: Write the failing test**

```js
// test_ui_tokens.js — parses ui/tokens.css as text; no browser needed.
const BANNED = ['oklch(', 'color-mix(', '@starting-style', 'subgrid', 'text-wrap:', 'view-transition'];
test('uses no CSS feature Chrome 109 lacks', () => {
  for (const f of BANNED) assert(!css.includes(f), f + ' is not available on Chrome 109');
});
test('declares no nested rule', () => assert(!/\{[^{}]*\{/.test(stripComments(css))));
// Review Focus 1: a token with no dark value is invisible text on a dark screen.
test('every semantic colour token has a dark value', () => {
  const light = tokensIn(rootBlock(css));
  const dark = tokensIn(darkBlock(css));
  assert.deepEqual(light.filter(isColourToken).sort(), dark.filter(isColourToken).sort());
});
test('Nirmala UI is named before Mangal', () =>
  assert(css.indexOf('Nirmala UI') < css.indexOf('Mangal')));
test('yard tap target is at least 48px and desk row at least 32px', () => {
  assert(px(valueOf(css, '[data-density="yard"]', '--tap')) >= 48);
  assert(px(valueOf(css, '[data-density="desk"]', '--row-h')) >= 32);
});
test('body text never goes below 15px yard / 14px desk', () => { /* --t5, --t6 */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test_ui_tokens.js`
Expected: FAIL — `ui/tokens.css` does not exist.

- [ ] **Step 3: Write `ui/tokens.css`**

Author the colour ramps in HSL by hand and check each pair against Task 1's contrast assertion; HSL lightness is perceptually uneven across hues, so the orange and the red will need different lightness numbers to look equally strong. Keep the existing app's orange as `--accent`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test_ui_tokens.js` — Expected: PASS

- [ ] **Step 5: Add a contrast assertion and make it pass**

```js
test('body text on every surface meets 4.5:1', () => {
  for (const [fg, bg] of PAIRS) assert(contrast(fg, bg) >= 4.5, fg + ' on ' + bg);
});
```
Implement `contrast()` from the WCAG relative-luminance formula in the test file. Adjust token lightness until it passes — do not lower the threshold.

- [ ] **Step 6: Commit**

```bash
git add ui/tokens.css test_ui_tokens.js
git commit -m "Design tokens, with the Chrome 109 floor enforced by a test"
```

---

### Task 2: Icon set

**Files:**
- Create: `ui/icons.js`
- Test: `test_ui_icons.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `ICONS` — an object mapping name to SVG path data — and `icon(name, opts)` returning an SVG string. `opts` is `{size, title}`; `size` defaults to `20`, `title` sets `<title>` and is omitted for decorative use, in which case `aria-hidden="true"` is set instead. Both are attached to `window` and usable from a plain script tag.

- [ ] **Step 1: Write the failing test**

```js
test('every icon is a single path on a 24-grid', () => {
  for (const [n, d] of Object.entries(ICONS)) {
    assert(typeof d === 'string' && d.length, n);
  }
  assert(Object.keys(ICONS).length <= 30, 'the set is meant to stay small');
});
test('contains no emoji', () => assert(!EMOJI_RE.test(JSON.stringify(ICONS))));
test('inherits colour rather than hard-coding it', () => {
  const s = icon('bus');
  assert(s.includes('currentColor'));
  assert(!/#[0-9a-f]{3,6}/i.test(s));
});
test('a named icon is announced, a decorative one is not', () => {
  assert(icon('warn', { title: 'Warning' }).includes('<title>Warning</title>'));
  assert(icon('warn').includes('aria-hidden="true"'));
});
// Review Focus 2: a missing icon must be visible, not nothing.
test('an unknown name renders a visible fallback', () => {
  const s = icon('no-such-icon');
  assert(s.includes('<svg'), 'must still render');
  assert(s.replace(/<svg[^>]*>|<\/svg>/g, '').trim().length > 0, 'must draw something');
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `node test_ui_icons.js`

- [ ] **Step 3: Implement `ui/icons.js`**

Draw the ~25 marks the 14 screens need: bus, job, part, person, fuel, money, review, star, gate, map, alert, warn, ok, bad, clock, search, filter, add, edit, delete, back, more, camera, doc, offline. Each a single path on a 24×24 grid, `stroke="currentColor"`, `fill="none"`, `stroke-width="1.75"`. The fallback is a dotted square so a missing name is obvious in the gallery rather than invisible.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add ui/icons.js test_ui_icons.js
git commit -m "The icon set that replaces 968 emoji Windows 7 cannot draw"
```

---

### Task 3: Core components

**Files:**
- Create: `ui/components.css`
- Test: `test_ui_components.js`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: classes `.btn` (`.btn-primary`, `.btn-quiet`, `.btn-danger`), `.field`, `.select`, `.row`, `.card`, `.table`, `.badge` (`.badge-ok`, `.badge-warn`, `.badge-bad`), `.tabs`, `.stat`. All respond to `[data-density]`. Overlays are Task 5.

- [ ] **Step 1: Write the failing test**

```js
test('uses no CSS feature Chrome 109 lacks', () => { /* same BANNED list as Task 1 */ });
test('only transform and opacity are transitioned', () => {
  for (const t of transitionsIn(css)) {
    assert(/^(transform|opacity)\b/.test(t), 'animating ' + t + ' drops frames on a Core 2 Duo');
  }
  assert(!/transition:\s*all/.test(css));
});
test('no transition is longer than 300ms', () => durationsIn(css).forEach(d => assert(d <= 300)));
test('ease-in is never used on its own', () => assert(!/\bease-in\b(?!-out)/.test(css)));
test('every pressable gets press feedback', () =>
  assert(css.includes('.btn:active') && css.includes('scale(0.97)')));
test('focus is visible', () => assert(/:focus-visible/.test(css)));
test('reduced motion removes movement', () => assert(css.includes('prefers-reduced-motion')));
test('figures are tabular', () => assert(css.includes('font-variant-numeric: tabular-nums')));
// Review Focus 4: an overlong value must not push a row's actions off screen.
test('row text truncates', () => assertBlock(css, '.row .t', ['overflow', 'text-overflow']));
```

- [ ] **Step 2: Run it to verify it fails**

- [ ] **Step 3: Implement `ui/components.css`**

Use `@layer tokens, base, components` for ordering, since nesting is unavailable. Rows are grid, not flex, so a long name truncates instead of shrinking the action.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add the Devanagari assertion and make it pass**

```js
// Review Focus 3: Hindi must not clip, and must not land on Mangal.
test('Hindi text has its own line-height and font stack', () => {
  assertBlock(css, '[lang="hi"]', ['font-family: var(--font-hi)', 'line-height']);
});
```

- [ ] **Step 6: Commit**

```bash
git add ui/components.css test_ui_components.js
git commit -m "The component layer, in two densities"
```

---

### Task 4: States

**Files:**
- Modify: `ui/components.css`
- Create: `ui/states.js`
- Test: `test_ui_states.js`

**Interfaces:**
- Consumes: `icon()` from Task 2.
- Produces: `emptyState(text, opts)`, `errorState(text, onRetry)`, `offlineState()`, `skeleton(rows)`, and `figure(value, opts)` where `opts` is `{unit, at, stale}`. `figure` returns the markup for one number.

- [ ] **Step 1: Write the failing test**

```js
// Review Focus 5: unknown, zero and stale are three different things.
test('a missing value is a dash, not a zero', () => {
  assert(figure(null).includes('—'));
  assert(figure(undefined).includes('—'));
});
test('a real zero shows zero', () => assert(/>0</.test(figure(0))));
test('a stale figure says when it was last true', () => {
  const h = figure(42, { at: Date.now() - 3 * 3600e3, stale: true });
  assert(h.includes('42'));
  assert(/ago|hour/.test(h), 'must say how old it is');
});
test('a fresh figure does not nag', () =>
  assert(!/ago/.test(figure(42, { at: Date.now() }))));
test('every state is announced to a screen reader', () => {
  for (const h of [emptyState('None'), errorState('Failed', () => {}), offlineState()]) {
    assert(/role="status"|aria-live/.test(h));
  }
});
test('states carry a word, never colour alone', () => {
  assert(/[A-Za-z]{3,}/.test(stripTags(offlineState())));
});
```

- [ ] **Step 2: Run it to verify it fails**

- [ ] **Step 3: Implement `ui/states.js` and the matching `.skeleton` / `.empty` rules**

`figure()` distinguishes `null`/`undefined` from `0` explicitly — `value == null` is the test, not falsiness, because `0` is falsy and is a real reading.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add ui/states.js ui/components.css test_ui_states.js
git commit -m "Loading, empty, stale, error and offline as first-class states"
```

---

### Task 5: Overlays — sheet, dialog, toast

The only components that animate, so the motion rules are tested here rather than
asserted in prose. They are also the only ones that take focus away from the page,
which is the part that breaks on a keyboard-driven office PC.

**Files:**
- Create: `ui/overlay.js`
- Modify: `ui/components.css`
- Test: `test_ui_overlay.js`

**Interfaces:**
- Consumes: `icon()` (Task 2), tokens (Task 1).
- Produces: `openSheet(title, html, opts)` / `closeSheet()`, `confirmDialog(text, opts)` returning a Promise of a boolean, and `toast(text, opts)` where `opts` is `{kind, ms}` with `kind` one of `ok | warn | bad`. `<dialog>` is the element for all three — it is available in Chrome 109 and gives focus trapping and Escape without script.

- [ ] **Step 1: Write the failing test**

```js
test('nothing enters from scale(0)', () => {
  assert(!/scale\(0\)/.test(css), 'nothing in the real world appears from nothing');
  assert(/scale\(0\.9[0-9]?\)/.test(css));
});
test('entering uses ease-out, and exit is quicker than enter', () => {
  assert(enterDuration(css, '.sheet') <= 250);
  assert(exitDuration(css, '.sheet') < enterDuration(css, '.sheet'));
});
test('a sheet is a dialog, so Escape and focus trapping are free', () =>
  assert(openSheet('T', '<p>x</p>').tagName === 'DIALOG'));
test('closing returns focus to whatever opened it', () => { /* opener.focus() on close */ });
test('a toast says what kind it is in words', () => {
  assert(/[A-Za-z]{3,}/.test(stripTags(toast('Saved', { kind: 'ok' }))));
});
test('toasts use transitions, not keyframes, so a rapid second one retargets', () =>
  assert(!/@keyframes[^}]*toast/i.test(css)));
test('reduced motion keeps the fade and drops the movement', () => {
  const b = reducedMotionBlock(css);
  assert(!/translate|scale/.test(b));
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `node test_ui_overlay.js`

- [ ] **Step 3: Implement `ui/overlay.js` and the overlay rules**

`confirmDialog` resolves `false` on Escape and on backdrop click, so a dismissed
dialog is never read as consent. A sheet records `document.activeElement` on open
and restores it on close.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add ui/overlay.js ui/components.css test_ui_overlay.js
git commit -m "Sheets, dialogs and toasts — the only things that animate"
```

---

### Task 6: Gallery and the performance budget

**Files:**
- Create: `ui/gallery.html`
- Modify: `scripts/predeploy-gate.sh`
- Test: via the gate

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Build `ui/gallery.html`**

Every component, in every state, in both densities, in both themes, on one page, with a density toggle and a theme toggle. Plain script tags; no build step. It is both the thing a person looks at and the fixture the gate drives.

- [ ] **Step 2: Add gate checks**

Follow the existing idiom in `scripts/predeploy-gate.sh`: synchronous expressions via `j`, results compared with `ck`. Do not hand `js` a promise — see the comment above `j()`.

```bash
ck "the gallery renders every component"  "$(j "document.querySelectorAll('[data-component]').length >= 12")" "true"
ck "no emoji survived into the design layer" \
  "$(j "/[\uD800-\uDBFF][\uDC00-\uDFFF]|[☀-➿]/.test(document.body.innerText) ? 'found' : 'none'")" "none"
ck "yard tap targets are at least 48px" \
  "$(j "(function(){var e=document.querySelectorAll('[data-density=yard] .btn');for(var i=0;i<e.length;i++){if(e[i].getBoundingClientRect().height<48)return 'small'}return 'ok'})()")" "ok"
ck "nothing overflows at 1024 wide" \
  "$(j "document.documentElement.scrollWidth <= 1024 ? 'fits' : 'overflows'")" "fits"
```

- [ ] **Step 3: Add the performance budget check**

The spec's budget is a test, not an aspiration. Render 200 rows and assert the time.

```bash
ck "200 rows render inside the budget" \
  "$(j "(function(){var t=performance.now();renderDemoRows(200);return (performance.now()-t) < 250 ? 'ok' : 'slow'})()")" "ok"
```
250ms is the desk budget on a developer machine; the real number comes from running `garage-check.html` on an office PC, and this threshold is tightened to match once those results arrive.

- [ ] **Step 4: Run the gate to verify it passes**

Run: `GS_GATE_PORT=8971 bash scripts/predeploy-gate.sh`
Expected: the new checks pass and the existing 133 still pass.

- [ ] **Step 5: Commit**

```bash
git add ui/gallery.html scripts/predeploy-gate.sh
git commit -m "A gallery that proves the system works on the hardware that runs it"
```

- [ ] **Step 6: Verify on real hardware**

Open `ui/gallery.html` on an office PC and on the oldest driver phone. Check against the device-check results: icons draw, both densities are usable, nothing overflows at 1024×768, and Hindi renders in Nirmala rather than Mangal. **This step is not optional and cannot be done from a developer machine** — the whole design is budgeted against hardware none of the above has run on.

---

## What this plan does not cover

The remaining eight subsystems each get their own spec and plan: identity and sessions, permissions, data and sync, GPS ingest, WhatsApp automation, Claude intelligence, migration, observability. Screen designs for the 14 come after this plan, drawn from the system it builds; the 968 emoji in `app.js` are replaced as each screen moves, not in a single sweep, so the live app keeps working throughout.

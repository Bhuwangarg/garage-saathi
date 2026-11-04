# Decisions already made

Every stage reads this before it starts. A decision here is not re-opened by an
agent; if one looks wrong, say so in your report and leave it standing until the
owner changes it.

Dated 2026-11-04 unless noted.

## 1. The hardware floor stands — Chrome 109 on Windows 7

Confirmed by the owner. Not an assumption, not a thing to design around later.

- No framework runtime. No polyfills.
- No `oklch()`, `color-mix()`, CSS nesting, `@starting-style`, view transitions,
  subgrid, `@scope`, relative colour syntax, `light-dark()`, `text-wrap: balance`.
- No `Object.groupBy`, `Array.prototype.toSorted` and kin, `Promise.withResolvers`.
- Colour ramps are hand-written HSL.
- Icons are inline SVG. Never emoji — Windows 7 never shipped the full set, so
  emoji are grey boxes on the machines the office uses all day.
- Animate `transform` and `opacity` only.
- Budgets are measured on the fleet-sized fixture, on the slowest machine we can
  get, not on a developer's Mac.

`scripts/check-css-floor.sh` enforces the list. It is a hard gate.

## 2. v2 is built alongside v1, at its own path

Confirmed by the owner. v1 keeps serving the office, untouched, the whole way
through. v2 is reachable at `/v2` for the owner and a few testers, and becomes
the default only when the owner says so.

What this requires, and whose job it is:

- **Backend**: the static handler serves the v2 bundle under `/v2` without
  touching how `/` is served. Same server, same endpoints, same database — v2
  is a second client against the existing sync API, not a second system.
- **Service worker**: v2's worker must be scoped to `/v2` only. A worker that
  claims `/` would hijack the live app for every device that ever opened v2,
  and the office would have no way to get back. This is the single most
  dangerous detail in the cutover; it gets its own gate check.
- **Data**: v2 reads and writes the same stores as v1. A record written in v2
  must be legible to v1 and the reverse, for as long as both are running —
  which means v2 does not get to change a record's shape unilaterally. A shape
  change is a migration, with v1 taught to read it first.
- **Cutover** is one line changing what `/` serves, and is therefore also one
  line to undo. Keep it that way.

## 3. The product direction from the approved v2 design stands

From `docs/superpowers/specs/2026-11-01-garage-saathi-v2-design.md` (committed).
47 screens become 14. Permissions invert to deny-by-default. ~968 emoji icons
become ~25 inline SVGs. Tenancy goes in the data model but no signup or billing
surfaces are built. These are not re-litigated per feature.

## 4. Still open — the owner decides, nobody else

- Whether a supervisor keeps company-level money visibility, in a business that
  handles cash. Today a supervisor reaches all 47 screens, identical to the
  owner. The proposed split is `dashboard` → `viewAlerts` / `viewCompanyBilling`
  and `bills` → `manageSupplierBills` / `viewSpendTotals`.
- Whether any supervisor actually does cash reconciliation — needs asking at the
  office, not inferring from the code.
- Device-level confirmation on the driver phones: versions are unmeasured.
- GPS retention on the device: 60 days locally against the server's 30. Halving
  it halves the login's cache read and loses history the server already discarded.

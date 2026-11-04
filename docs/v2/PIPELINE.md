# The build pipeline

Every change to this product — the v2 rebuild and every feature after it — goes
through the same five stages in the same order. The order is the point: UX
decides what a screen is for, UI decides what it looks like, and nobody writes
code until both are written down.

The pipeline is deliberately small. Seven agent definitions, one script, this
file. No configuration, no plugins, no DSL. If you cannot read the whole thing
in twenty minutes it has failed at its only job, which is to be obvious.

## The five stages

```
  request
     |
  1. UX        product-planner    ->  docs/v2/plan/<slug>-ux.md
     |         (the main agent: owns what we are building and why)
     |
  2. UI        ui-designer        ->  docs/v2/plan/<slug>-ui.md
     |         (refuses to start without a signed-off UX doc)
     |
  3. BUILD     frontend-lead  +  backend-lead     (parallel)
     |              |                 |
     |           builder xN        builder xN     (each lead splits its own work)
     |
  4. ASSEMBLE  integrator         ->  one branch, seams named
     |
  5. REVIEW    reviewer           ->  docs/v2/reviews/<slug>.md
     |
   ship
```

## Why artifacts on disk, not conversation

Each stage reads a file and writes a file. Nothing is handed over in chat.
Three reasons, all of them learned the hard way on this codebase:

- A stage can be re-run without re-running the ones before it.
- A human can read what was decided, six months later, without a transcript.
- An agent gets exactly its input, not the whole history of the session, which
  is what keeps a 14,000-line file from being pasted into every prompt.

## The gates

A stage does not pass because it finished. It passes because its exit condition
is checkable by someone who was not there. Vague gates are how the current app
grew 47 screens.

| Stage | Exit condition — all of it falsifiable |
|---|---|
| 1. UX | Every screen traces to a named role and a job that person does today. A screen with no job named does not get built. Every job in the inventory is either covered or explicitly dropped with a reason. |
| 2. UI | Every screen in the UX doc has a spec. Tokens defined once and referenced. No `oklch()`, `color-mix()`, CSS nesting, `@starting-style` or view transitions — `scripts/check-css-floor.sh` greps for them, because the office is frozen on Chrome 109. |
| 3. Build | `scripts/predeploy-gate.sh` passes with zero failures, and the slice has added at least one check that fails when its own feature is broken. A check that cannot fail is decoration. |
| 4. Assemble | One branch, gate green on the assembled whole, and every seam between slices named in the commit. |
| 5. Review | Findings verified against the code before being reported. An unverified finding is a guess, and guesses have cost this project days. |

## The hardware floor — read this before designing anything

The office runs **Windows 7 on Chrome 109**, the last version that platform can
run. Several of the office PCs are Core 2 Duos. This is not a preference to be
designed around later; it is the floor, and it has already decided things:

- No framework runtime. React or Next would add payload to every office PC
  permanently, to solve a problem these screens do not have.
- Colour ramps are hand-tuned HSL, not generated — `oklch()` and `color-mix()`
  do not exist in 109.
- Nothing is polyfilled. A polyfill is JavaScript, and JavaScript is the
  expensive thing on these machines.
- The app draws many of its icons as emoji today, and Windows 7 never shipped
  the full emoji set, so those render as grey boxes on the machines the office
  uses all day. Icons are inline SVG.

Every budget in the UI stage is a measured number from a fleet-sized fixture
(40,000 GPS events, 80,700 rows), not a target someone liked the sound of.

## Running it

A feature request:

```
Workflow: .claude/workflows/feature.js   args: { slug, request }
```

Or a single stage by hand, when you want to look at the output before paying
for the next one:

```
Agent: subagent_type product-planner   (stage 1)
Agent: subagent_type ui-designer       (stage 2)
```

Stage 1 and stage 2 are cheap and are where the leverage is. Stage 3 is where
the money goes. Do not start stage 3 on a UX doc nobody has read.

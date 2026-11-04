# Garage Saathi — how work happens here

This is a live system. About 100 people at Mahalaxmi Travels use it every
working day to keep a bus fleet running. A bad deploy is somebody standing at a
pump or a gate unable to do their job, so the rules below are not ceremony.

## Every change goes through the pipeline, in order

Read `docs/v2/PIPELINE.md` once. The short version:

```
UX  ->  UI  ->  build (frontend + backend in parallel)  ->  assemble  ->  review
```

**Do not write application code for a new feature before the UX doc and the UI
spec exist.** Not "mostly exist" — exist, in `docs/v2/plan/`, readable by the
owner. Three rounds of work on this codebase were spent building the wrong
thing well, and each round looked productive the whole way through.

To run it: the `feature` workflow in `.claude/workflows/feature.js`, with
`args: { slug, request }`. To do a stage by hand, dispatch the matching agent
from `.claude/agents/`. Stages 1 and 2 are cheap and are where the leverage is.

A bug fix in existing code is not a feature and does not need the pipeline. A
change to what a screen is for does.

## The hardware floor

The office runs **Windows 7, so Chrome 109**, some of it on Core 2 Duos. No
framework runtime, no polyfills, no `oklch()`, no `color-mix()`, no CSS
nesting, no emoji in rendered strings. `scripts/check-css-floor.sh` enforces
this and is a hard gate, not advice.

## Before any push

`scripts/predeploy-gate.sh` must be green. The `.githooks/pre-push` hook runs
it. Never weaken or delete a check to make a change pass — if a check is wrong,
say so and fix the check deliberately, in its own commit.

A check that cannot fail is decoration. After adding one, break the thing it
covers and confirm it goes red.

## Measure before you claim

Every performance number in this repo's commit messages is a measured figure
from a fleet-sized fixture (40,000 GPS events, 80,700 rows). Days have been
lost here to fixes aimed at plausible causes that were not the cause. Get the
number first, then fix the thing the number names. If you report a result you
did not measure, say so in the same sentence.

## Things that are the owner's call, not yours

- Production database writes and production redeploys. Hand over the SQL or the
  command; do not run it.
- Minting or changing anyone's PIN or login.
- Commits and pushes: only when asked.
- Retention and permission policy — what a supervisor may see in a business
  that handles cash is a business decision.

Never commit a secret, token, PIN, password or connection string. Never put one
in a document, a log, a test fixture or a commit message.

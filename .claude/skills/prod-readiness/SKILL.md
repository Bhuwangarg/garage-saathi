---
name: prod-readiness
description: Audit Garage Saathi against the 111-item production-engineering checklist (rate limiting, caching, idempotency, retries, injection, secrets, backups, observability, deploys…). Run it before a risky deploy, after adding an endpoint or a store, or whenever you want to know what is actually unguarded. Reports findings; fixes only what is mechanical and safe.
---

# Production readiness — the 111 items

## Read this before you run it

The checklist is 111 engineering **concepts**, not 111 defects. Three honest
consequences, and the skill is built around them:

1. **Most of them cannot be "fixed".** "CAP theorem", "P99 latency",
   "postmortems" and "on-call" are things you understand, measure or practise.
   There is no edit that makes them done. The skill states what each one means
   *for this system* and, where there is something to check, checks it.

2. **About a third do not apply to this stack.** Garage Saathi is a vanilla-JS
   offline-first PWA, a single Python stdlib handler on Vercel serverless
   (region `bom1`), one Supabase Postgres and Cloudflare R2. There is no
   Kubernetes, no Helm, no service mesh, no service discovery, no leader
   election, no sharding, no multi-region. Claiming to have "fixed" those would
   be a lie, so they are marked **n/a** with the reason.

3. **Anything that changes behaviour is reported, not applied.** Adding rate
   limiting to `/push`, or turning on a WAF, changes how the app behaves for
   people in the yard at 4 a.m. The skill prints the finding and the fix it
   recommends; a human decides.

What it genuinely does: run every automatable check against the code on disk,
tell you which of the 111 are **GUARDED**, **GAP**, **MANUAL** (a human has to
look) or **N/A**, and apply the subset of fixes that are mechanical and
reversible when asked.

## Running it

```bash
python3 .claude/skills/prod-readiness/scripts/audit.py
```

Flags:

- `--only rate,sql,secrets` — run just those groups
- `--json` — machine-readable, for a workflow or a gate
- `--fail-on-gap` — exit 1 if any GAP is found (use in CI, not in the pre-push
  gate: `scripts/predeploy-gate.sh` guards behaviour, this guards posture)

The checks are static: greps, AST walks and file reads over the repo. It never
touches the production database, never calls the deployed server, and never
needs a secret. That is deliberate — an audit you are afraid to run is an audit
nobody runs.

## After it runs

1. Read the **GAP** lines first. Each one names the file and what to do.
2. **MANUAL** lines are questions for a person, not failures. Several can only
   be answered in the Supabase or Vercel dashboard (backup retention, the
   Postgres pooler, log drains).
3. If you fix something, re-run it. If you decide a GAP is acceptable, record
   that decision in `references/items.md` next to the item, with the date and
   the reason — otherwise the next run raises it again and somebody re-litigates
   a settled question.

## Where the detail lives

`references/items.md` holds all 111 items: the verdict for this system, why,
and — for the ones with teeth — what the check actually looks at. Read it before
arguing with a result.

## Adding a check

Open `scripts/audit.py` and add to `CHECKS`: an item number, a group, and a
function taking the repo root and returning `(status, message)`. Keep each
check to one fact. A check that can only say "looks fine" is worse than no
check, because it reads as a guarantee.

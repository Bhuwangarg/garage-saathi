# The map of what exists today

Five documents, written from the source rather than from the older docs. Where
a repo document disagreed with the code, the code won and the disagreement is
recorded. `ROLES.md`, `SITEMAP.html` and `FEATURES.md` are all stale enough to
mislead — `ROLES.md` describes five roles and an app of about 1,650 lines.

| # | File | What it settles |
|---|---|---|
| 01 | `01-screens-and-nav.md` | 53 routes, 59 view functions, per-role tabs and Me menu, what each screen is for, what overlaps, what is unreachable |
| 02 | `02-roles-and-permissions.md` | 8 roles, 37 capabilities, 50 route guards, where enforcement actually happens, server redaction, every recorded past bypass |
| 03 | `03-data-and-sync.md` | 41 stores with shapes, who writes them, retention, the sync cycle, conflict behaviour, the measured budgets |
| 04 | `04-server-and-integrations.md` | 44 endpoints, 11 AI jobs, 13 external integrations, auth, ops, crons, alerting |
| 05 | `05-user-needs.md` | Per role: who they are, where they stand, the jobs they do, and the friction ranked by hours lost |

Numbers that corrected my own earlier assumptions, kept here because the
mistake is the useful part:

- **41 stores, not 40.** The "forty" in the code comments counts the client
  cache, which omits `meta`.
- **44 endpoints, not ~29.** A grep for quoted paths misses the families.
- **Page size is 2,000 records / 2.5 MB**, not 600. That changed on 2 Nov.
- **The server never deletes a record.** Its "retention" is a send window
  applied on read, inside `redact_for`.
- **Permission is not reachability.** Holding a capability and having a button
  that leads there are independent in this codebase, and they disagree badly.

What this map does not contain: per-store production row counts, which the code
never states. Those are marked UNDETERMINED rather than guessed.

Live problems found while writing it are in `../LIVE-ISSUES.md`. They are about
v1, they are unfixed, and three of them are verified in source.

# Time one job card, before stage 3 builds anything

The biggest claim in the whole plan is that supervisors lose 3 to 13 hours a
week keying job cards on mechanics' behalf. The range is that wide because the
number behind it — **how long one card takes** — has never been measured. Every
other figure in it (how many cards, how many people) is inferred too.

So the claim is currently unfalsifiable, and it is the justification for the
single biggest change in v2. One afternoon settles it.

## What to do

Watch **one supervisor** key in **five** job cards, on the machine he normally
uses. Do not help him, do not tidy the cards first, and do not tell him which
five in advance.

For each card, write down:

| | |
|---|---|
| Card | the bus, so it can be looked up afterwards |
| Started | clock time he begins |
| Finished | clock time the card is saved |
| Interruptions | how many times he stopped, and roughly how long for |
| Source | paper slip / his memory / he asked the mechanic / phone photo |
| Retyped | which fields he was copying from somewhere rather than deciding |

Then two numbers for the week, from him rather than from a guess:

- How many cards does he key in a normal week?
- Of those, how many are his own work versus a mechanic's?

## Why each column is there

**Interruptions** decide whether the fix is fewer taps or fewer interruptions.
If a card takes nine minutes of which six is being interrupted, no screen
design recovers those six.

**Source** decides whether the mechanic's two taps help. If he is reading a
paper slip the mechanic wrote, the taps remove the slip and the retyping. If he
is working from memory or asking aloud, the taps give him a record he does not
currently have — a bigger win, and a different one.

**Retyped** is the only column that directly measures the thing v2 removes. A
field he is copying is a field the mechanic could have entered once.

## What the answer changes

- **Under ~2 minutes a card** — the friction is real but small, and the top of
  the ranking is wrong. Say so; the mechanic's taps are still worth building
  because they are nearly free, but they stop being the headline.
- **2 to 6 minutes** — the estimate holds and v2's plan is aimed correctly.
- **Over 6 minutes, mostly interruptions** — the screen is not the problem and
  the plan is aimed at the wrong thing. Better to know before building twelve
  screens than after.

## Where it goes

Into `docs/v2/plan/v2-ux.md` §7 measure 2, replacing the placeholder, with the
date and whose time was measured. And into `DECISIONS.md` as the answer to the
open question, so the next person reads a number instead of a range.

If the five cards disagree wildly with each other, that is the finding: it means
the time depends on something nobody has identified yet, and the next step is
finding out what, not averaging it away.

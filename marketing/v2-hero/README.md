# The v2 hero

An animated illustration of Garage Saathi v2 for a page that is *about* the
product: a landing page, a feature card, a docs header. It shows the Attention
list, acts on the top thing in it, and the list gets shorter — which is the
argument for the rewrite in one motion.

```bash
npm install
npm run dev          # http://localhost:5181
```

`REHEARSAL.md` beside this file is the build record: the beats, every automated
line the rehearsal gate raised, what was fixed, what was judged and why, and —
the part worth reading — what was never checked.

## This is React, and that is allowed *here* and nowhere else

The app runs on Windows 7 and Chrome 109 on Core 2 Duos, with no framework
runtime, because a framework is payload every office PC pays for on every load.
Nothing in this folder ever reaches a yard:

- It is not referenced by `index.html`, `sw.js` or any app file.
- `vercel.json`'s `includeFiles` is an allowlist and does not include
  `marketing/**`, so the deployed function never carries it.
- It builds to nothing the app serves. Treat `dist/` as throwaway.

If that ever stops being true, this folder is the thing to delete.

## It is drawn from the product, not from taste

Everything that could be read from the app was read from the app, so the
illustration cannot drift from the thing it illustrates:

| What | Where it came from |
|---|---|
| Colours | `v2/ui/tokens.css` — warm paper `hsl(40 22% 96%)`, the accent `hsl(16 88% 54%)` |
| Glyphs | `v2/ui/icons.js` — the real paths, inline SVG, which is why the app has them at all |
| Words | `v2/screens/attention.js`, `today.js` — "Held at the gate", "Standing 3 hours.", "Low stock" |

Only the fleet data is invented: bus numbers, routes and departure times. The
product's own strings are not, and should not be — the plain voice is the
product, and a demo that reads like dashboard nouns is illustrating something
else.

**If the app's tokens change, change them here too.** There is no import
between the two: the app is plain ES5 script with no build step and this is a
TypeScript bundle, and wiring them together would mean giving the app a build
step to serve a marketing page. Two copies and a note is the cheaper mistake.

## `kit/` is vendored, and trimmed

The stage, frames, motion and parts come from the `stageshow` skill
(`npx skills add benjitaylor/skills --skill stageshow`), MIT, Copyright (c)
2026 Benji Taylor — see `kit/LICENSE`. It is vendored rather than installed so
this folder survives the skill being removed or re-installed.

`kit/brands/` and `kit/parts/BrandMark.tsx` were **not** vendored: 236K of other
companies' logos under their own separate licences, which this hero does not use
and which a bus fleet's repository has no reason to carry. Three export lines in
`kit/index.ts` and `kit/parts/index.ts` were removed with them. If you ever need
`BrandMark`, take it and `brands/` from the skill, and carry its licence files.

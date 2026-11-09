#!/usr/bin/env python3
"""Does scripts/check-floor.py actually fail?

THE GATE'S FLOOR CHECK HAD A HOLE FOR THREE DAYS and the structural reason is
this file's absence. Five test files RUN `check-floor.py` and assert it exits
0; not one of them ever asked whether it CAN exit 1. So when the outside-repair
review appended CSS nesting, a `v`-flag regex, the popover API, `Set.union` and
nine more post-109 constructs to `v2/ui/work.css` at the tip, the check said
`✅ within the Chrome 109 floor` and every suite stayed green.

A check nobody has broken is a decoration. This file breaks it, once per
pattern, and is the thing that keeps the list honest as it grows: add a
pattern to BANNED, add its probe here, or the next person cannot tell your
pattern from a typo that matches nothing.

Two halves, and both matter:

  CAUGHT    -- each construct, alone in one file, must make the check exit 1.
  NOT CAUGHT-- the real tree must still exit 0. The first draft of the `v` flag
               pattern read `'</span></div>'` as a regex with flags `div` (d, i
               and v are all real flag letters) and reported 123 violations in
               54 files, every one an HTML string. A check that cries wolf 123
               times is one somebody switches off with --no-verify, and then it
               checks nothing at all. That is this repo's own stated lesson
               about the `grep -E` version, in check-floor.py's docstring.

Run: python3 test_floor_check.py
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
CHECK = ROOT / "scripts" / "check-floor.py"

fails = 0
checks = 0


def check(name, ok, detail=""):
    global fails, checks
    checks += 1
    if ok:
        print("  ok  " + name)
    else:
        fails += 1
        print(" FAIL " + name)
        if detail:
            for line in str(detail).splitlines()[:40]:
                print("        " + line)


def run_on(path):
    r = subprocess.run([sys.executable, str(CHECK), str(path)],
                       capture_output=True, text=True, cwd=str(ROOT))
    return r.returncode, r.stdout + r.stderr


# Each probe is ONE construct in ONE file. Every one of these renders as
# nothing -- or, for the two marked, kills the whole file -- on Chrome 109.
# Versions are from caniuse / Chrome developer docs.
PROBES = [
    # The hole itself, in all three of its shapes. The first two are what the
    # old line regex `^\s*&[\s.:>+~\[{]` could not see, because what makes a
    # selector nested is WHERE it is, not how it is written.
    ("CSS nesting, a bare class and no &", "a.css",
     "[data-v2] .oj-sheet {\n  color: var(--ink);\n  .oj-err { color: var(--bad); }\n}\n"),
    ("CSS nesting, a child combinator and no &", "a.css",
     "[data-v2] .oj-sheet {\n  color: var(--ink);\n  > .field { width: 100%; }\n}\n"),
    ("CSS nesting with an & (the shape that was already caught)", "a.css",
     ".a {\n  color: red;\n  &:hover { color: blue; }\n}\n"),

    # A SyntaxError at PARSE time: the whole script file fails to load. For
    # v2/ui/passes.js that is every sheet in the outside repair gone; for
    # v2/screens/jobcard.js, a blank card. Nothing warns.
    ("a v-flag regex, which is a parse error on 109", "a.js",
     "var re = /[\\p{ASCII}--[a-z]]/v;\n"),
    # Throws at the tap rather than at load.
    ("Set.union", "a.js", "var z = new Set(x).union(y);\n"),
    ("Array.prototype.with on a variable, not a literal", "a.js",
     "var next = rows.with(0, v);\n"),

    # The popover API. The attribute is ignored and the calls throw, so a sheet
    # built on it never opens -- and this is the first cut whose UI IS sheets.
    ("showPopover()", "a.js", "el.showPopover();\n"),
    ("the popover attribute", "a.js", "el.setAttribute('popover', 'auto');\n"),
    (":popover-open", "a.css", ".a:popover-open { opacity: 1; }\n"),

    ("transition-behavior", "a.css", ".a { transition-behavior: allow-discrete; }\n"),
    ("allow-discrete inside the transition shorthand", "a.css",
     ".a { transition: display .2s allow-discrete; }\n"),
    ("linear() easing", "a.css", ".a { transition-timing-function: linear(0, 0.25, 1); }\n"),
    ("lab()", "a.css", ".a { color: lab(52% 40 59); }\n"),
    ("lch()", "a.css", ".a { color: lch(52% 72 40); }\n"),
    ("color()", "a.css", ".a { color: color(display-p3 1 0 0); }\n"),
    (":nth-child(2 of .v2row)", "a.css", ".a:nth-child(2 of .v2row) { color: red; }\n"),
    ("CSS round()", "a.css", ".a { width: round(up, 101px, 8px); }\n"),
    ("a scrollend listener", "a.js", "el.addEventListener('scrollend', fn);\n"),
    ("URL.canParse", "a.js", "if (URL.canParse(u)) {}\n"),

    # The patterns that were already there before 9 Nov. They are probed too:
    # an untested pattern is the same decoration whoever wrote it.
    ("oklch()", "a.css", ".a { color: oklch(70% 0.1 200); }\n"),
    ("color-mix()", "a.css", ".a { color: color-mix(in srgb, red, blue); }\n"),
    ("@starting-style", "a.css", "@starting-style { .a { opacity: 0; } }\n"),
    ("subgrid", "a.css", ".a { grid-template-rows: subgrid; }\n"),
    ("text-wrap: balance", "a.css", ".a { text-wrap: balance; }\n"),
    ("Object.groupBy", "a.js", "var g = Object.groupBy(rows, fn);\n"),
    ("toSorted()", "a.js", "var s = rows.toSorted();\n"),
    ("Promise.withResolvers", "a.js", "var p = Promise.withResolvers();\n"),
    # The six the coverage check below caught as never having been exercised:
    # in the list since v2 began, and until now indistinguishable from a typo
    # that matches nothing.
    ("relative colour syntax", "a.css", ".a { color: rgb(from var(--ink) r g b / 50%); }\n"),
    ("light-dark()", "a.css", ".a { color: light-dark(white, black); }\n"),
    ("view transitions", "a.css", ".a { view-transition-name: card; }\n"),
    ("@scope", "a.css", "@scope (.a) {\n  .b { color: red; }\n}\n"),
    ("Array.fromAsync", "a.js", "var a = await Array.fromAsync(gen());\n"),
    ("String.isWellFormed", "a.js", "if (s.isWellFormed()) {}\n"),
    ("an emoji in a rendered string", "a.js", "var t = 'done \u2705';\n"),
    ("the alarm clock, which a previous round of this check missed", "a.js",
     "var t = 'late \u23f0';\n"),
    # Found by this suite on its first run: six ASCII characters on disk, a
    # check mark at runtime, and the character scan cannot see it.
    ("an emoji written as a \\uXXXX escape", "a.js", "var t = 'done \\u2705';\n"),
    ("an emoji written as a \\u{...} escape", "a.js", "var t = 'x \\u{1F600}';\n"),
    ("an emoji written as an HTML numeric entity", "a.html",
     "<p>done &#x2705;</p>\n"),
]

print("── does the floor check fail when it should? ──")

tmp = pathlib.Path(tempfile.mkdtemp(prefix="floorprobe-"))
try:
    for name, fname, body in PROBES:
        d = tmp / "p"
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
        (d / fname).write_text(body, encoding="utf-8")
        code, out = run_on(d)
        check(name + " is caught", code == 1,
              "the check exited %d and said:\n%s" % (code, out))

    # A construct Chrome 109 HAS must not be reported, or the check blocks
    # honest work. These are the shapes nearest the banned ones.
    CLEAN = [
        ("@media with a rule inside it is not nesting", "a.css",
         "@media (min-width: 600px) {\n  .a { color: red; }\n}\n"),
        ("@keyframes with a stop inside it is not nesting", "a.css",
         "@keyframes x {\n  0% { opacity: 0; }\n  100% { opacity: 1; }\n}\n"),
        ("@supports with a rule inside it is not nesting", "a.css",
         "@supports (display: grid) {\n  .a { display: grid; }\n}\n"),
        ("linear-gradient() is not linear()", "a.css",
         ".a { background: linear-gradient(red, blue); }\n"),
        ("a rem unit is not the rem() function", "a.css", ".a { font-size: 1.5rem; }\n"),
        ("an HTML string full of slashes is not a v-flag regex", "a.js",
         "var h = '<span class=\"x\">' + esc(v) + '</span></div>';\n"),
        ("division is not a regex", "a.js", "var r = (a + b) / c / d;\n"),
        ("a plain regex with real flags is fine", "a.js", "var re = /^a.*b$/gi;\n"),
        ("an arrow in a comment is not an emoji", "a.js", "var s = 'a -> b';\n"),
    ]
    for name, fname, body in CLEAN:
        d = tmp / "c"
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
        (d / fname).write_text(body, encoding="utf-8")
        code, out = run_on(d)
        check(name + " is NOT reported", code == 0,
              "the check reported it:\n%s" % out)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# And the live tree, which must stay green: every pattern above is tight
# enough to run against the real thing.
code, out = run_on(ROOT / "v2")
check("the real v2/ tree is within the floor", code == 0, out)

# EVERY PATTERN IN BANNED MUST BE EXERCISED BY A PROBE. Counting them was the
# first version of this check and it was useless -- the counts drift, one
# pattern covers three probes, and a crude ">=" passes while a pattern nobody
# has ever triggered sits in the list matching nothing. So import the list and
# ask which descriptions actually fired.
import importlib.util

spec = importlib.util.spec_from_file_location("floorcheck", CHECK)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

fired = set()
tmp2 = pathlib.Path(tempfile.mkdtemp(prefix="floorcover-"))
try:
    for name, fname, body in PROBES:
        d = tmp2 / "p"
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
        (d / fname).write_text(body, encoding="utf-8")
        _, out = run_on(d)
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("\u2717 "):
                fired.add(line[2:].strip())
finally:
    shutil.rmtree(tmp2, ignore_errors=True)

unexercised = []
for desc, _pat in mod.BANNED:
    if not any(f.startswith(desc[:40]) for f in fired):
        unexercised.append(desc)
check("every one of the %d banned patterns is triggered by a probe" % len(mod.BANNED),
      not unexercised,
      "these patterns are in BANNED and no probe here makes them fire, so "
      "nobody can tell them from a typo that matches nothing:\n  "
      + "\n  ".join(unexercised))

print("──")
if fails:
    print("\u274c %d of %d failed" % (fails, checks))
    sys.exit(1)
print("\u2705 %d checks: the floor check reddens on every construct it claims to catch"
      % checks)
sys.exit(0)

#!/usr/bin/env python3
"""Chrome 109 floor check: does anything here fail to render on a Windows 7 PC?

The office runs Windows 7, which cannot run a Chrome newer than 109, and some
of those machines are Core 2 Duos. A CSS feature Chrome 109 does not know does
not warn -- the declaration is dropped and the page quietly looks wrong, which
is the worst way for this to be found.

WHY THIS IS PYTHON AND NOT A PILE OF GREPS.

The first version was `grep -E` per feature, and it reported three violations in
ui/ that were all COMMENTS -- the design system's own notes saying "no oklch(),
no color-mix()". Good engineers write exactly those comments, so a checker that
cannot tell a property from prose about it blocks honest work and teaches people
to pass --no-verify. It also used `grep -P` for emoji, which BSD grep does not
have, so that check silently matched nothing and passed by doing nothing at all.

So: strip comments, then match. And do the emoji scan in the same pass, in a
language that has real Unicode ranges everywhere.

Versions below are from caniuse / Chrome developer docs, not from memory.

Usage: check-floor.py [paths...]        (default: v2/)
Exit 0 = within the floor. Exit 1 = something here is invisible on an office PC.
"""
import re
import sys
import pathlib

# (description, compiled pattern). Each is a feature Chrome 109 does not have.
BANNED = [
    ("oklch() / oklab() — Chrome 111", re.compile(r"\bokl(ch|ab)\s*\(")),
    ("color-mix() — Chrome 111", re.compile(r"\bcolor-mix\s*\(")),
    ("relative colour syntax — Chrome 119",
     re.compile(r"\b(rgb|hsl|hwb|lab|lch|oklab|oklch)\(\s*from\b")),
    ("light-dark() — Chrome 123", re.compile(r"\blight-dark\s*\(")),
    ("subgrid — Chrome 117", re.compile(r"grid-template-(rows|columns)\s*:\s*subgrid")),
    ("@starting-style — Chrome 117", re.compile(r"@starting-style")),
    ("view transitions — Chrome 111",
     re.compile(r"@view-transition|view-transition-name|startViewTransition")),
    ("@scope — Chrome 118", re.compile(r"@scope[\s{]")),
    ("text-wrap: balance/pretty — Chrome 114",
     re.compile(r"text-wrap\s*:\s*(balance|pretty)")),
    ("Object/Map.groupBy — Chrome 117", re.compile(r"\b(Object|Map)\.groupBy\s*\(")),
    ("toSorted/toReversed/toSpliced — Chrome 110",
     re.compile(r"\.(toSorted|toReversed|toSpliced)\s*\(")),
    # Was `\]\s*\.with\s*\(`, which only saw `[1,2,3].with(...)` -- a literal
    # array. The real shape is `rows.with(0, v)` on a variable, and the review
    # measured that passing. Any `.with(` now, because nothing in this repo
    # defines a method by that name (checked) and Chrome 109 throws on the
    # built-in. `Promise.withResolvers` is covered on its own line and does not
    # match: this needs the `(` straight after `with`.
    ("Array.prototype.with — Chrome 110", re.compile(r"\.with\s*\(")),
    ("Promise.withResolvers — Chrome 119", re.compile(r"\bPromise\.withResolvers")),
    ("Array.fromAsync — Chrome 121", re.compile(r"\bArray\.fromAsync")),
    ("String.isWellFormed — Chrome 111", re.compile(r"\.(isWellFormed|toWellFormed)\s*\(")),

    # ---- added 9 Nov 2026, closing the hole the outside-repair floor review
    # ---- measured: it appended nesting, a v-flag regex, popover, Set.union
    # ---- and nine more to work.css and this check still said exit 0. Each
    # ---- pattern below was broken once, alone, and watched go red.
    #
    # The two that are not a dropped declaration but a DEAD FILE on Chrome 109:
    # a `v`-flag regex is a SyntaxError at parse time, so the whole script
    # fails to load -- for ui/passes.js that is every sheet in the outside
    # repair gone, for screens/jobcard.js a blank card. Nothing warns.
    # The `/` must be where a regex can legally START -- after `=`, `(`, `,`,
    # a return, and so on. Without that anchor this pattern read
    # `'</span></div>'` as a regex with flags `div`: `d`, `i` and `v` are all
    # real flag letters, so it reported 123 violations across 54 files, every
    # one of them an HTML string. A check that cries wolf 123 times is a check
    # somebody switches off, and then it checks nothing.
    ("regex v flag — Chrome 112, a SyntaxError at parse time: the whole file fails to load",
     re.compile(r"(?:^|[=(,;:!&|?{}\[+]|\breturn|\btypeof|\bcase)\s*"
                r"/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+/[dgimsuy]*v[dgimsuy]*(?![\w$])")),
    ("Set.union/intersection/difference — Chrome 122, throws at the tap",
     re.compile(r"\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\s*\(")),

    # The popover API: the attribute is ignored and the calls throw, so a
    # sheet built on it never opens at all.
    ("popover API — Chrome 114",
     re.compile(r'(showPopover|hidePopover|togglePopover)\s*\(|[\'"]popover[\'"]|\[popover|:popover-open|\bpopover\s*:')),

    ("transition-behavior / allow-discrete — Chrome 117",
     re.compile(r"\btransition-behavior\b|\ballow-discrete\b")),
    ("linear() easing — Chrome 113", re.compile(r"\blinear\s*\(")),
    ("lab() / lch() / color() — Chrome 111",
     re.compile(r"\b(lab|lch|color)\s*\(\s*(?!from\b)[^)]")),
    (":nth-child(… of …) — Chrome 111",
     re.compile(r":nth-(child|last-child)\s*\([^)]*\bof\b")),
    ("CSS round()/mod()/rem() — Chrome 112",
     re.compile(r"[\s:(,]\b(round|mod|rem)\s*\(")),
    ("scrollend — Chrome 114", re.compile(r'[\'"]scrollend[\'"]|\bonscrollend\b')),
    ("URL.canParse — Chrome 120", re.compile(r"\bURL\.canParse")),
]

# CSS nesting, Chrome 112. THIS WAS THE HOLE, and it was shaped like a line
# regex: `^\s*&[\s.:>+~\[{]` sees only the `&`-leading shape, and neither of
# the two commonest ways to nest starts with one --
#
#     [data-v2] .oj-sheet { color: var(--ink);
#       .oj-err { color: var(--bad); }     <- no &
#       > .field { width: 100%; }          <- no &
#     }
#
# Chrome 109 drops both blocks: the error line and the full-width field are
# simply not styled, and nothing warns. The review appended exactly that to
# work.css at the tip and the check still exited 0.
#
# A line regex cannot see this, because what makes a selector nested is not how
# it is written but WHERE it is: inside a style rule's braces. So track brace
# depth and what kind of block each one is. A block opened while the enclosing
# block is a STYLE RULE is nesting. A block opened inside an at-rule is not --
# `@media { .a { } }` and `@keyframes x { 0% { } }` have always been legal and
# are all over this codebase.
NESTING_AMP = re.compile(r"&")


def css_nesting_hits(code):
    """Line numbers in `code` (comments already stripped) that nest a rule.

    Returns [(line_no, text)]. The scan is on characters, not lines, because a
    selector's preamble may span several lines and the `{` that matters may sit
    on any of them.
    """
    hits = []
    stack = []          # 'rule' | 'at', innermost last
    pre_start = 0       # where the current block's preamble began
    i, n = 0, len(code)
    while i < n:
        ch = code[i]
        if ch == "{":
            pre = code[pre_start:i]
            kind = "at" if pre.lstrip().startswith("@") else "rule"
            # A rule opened inside a rule is a nested rule.
            if kind == "rule" and stack and stack[-1] == "rule":
                ln = code.count("\n", 0, i) + 1
                sel = " ".join(pre.split())[-80:]
                hits.append((ln, sel + " {"))
            stack.append(kind)
            pre_start = i + 1
        elif ch == "}":
            if stack:
                stack.pop()
            pre_start = i + 1
        elif ch == ";":
            pre_start = i + 1
        i += 1
    return hits

# Windows 7 never shipped the full emoji set, so an emoji in a rendered string
# is a grey box on an office PC. Icons here are inline SVG.
# Pictographs and dingbats only. The arrow block (U+2190-21FF) used to be in
# here and is now out: an arrow is not an emoji, Windows 7 renders -> and the
# rest from ordinary fonts, and including it flagged nineteen comments in the
# data layer that had been harmless for a year.
#
# U+231A-231B and U+23E9-23FA were MISSING and are added here: the watch, the
# hourglass, and the clock/media block that carries the alarm clock, the timer,
# the stopwatch and the pause and record marks. Verified before and after --
# U+23F0, U+231B and U+23F1 each passed this checker on their own, and each is
# red now. They are Emoji_Presentation=Yes, which is the test that matters: the
# font is asked for a colour glyph whether or not a variation selector follows,
# and Windows 7 has none to give.
#
# What is deliberately NOT added, having been considered:
#   - (c), (R), (TM), the information source and the geometric shapes default to
#     TEXT presentation and render from ordinary Windows 7 fonts. They only turn
#     into emoji when followed by U+FE0F, which is already banned below, so
#     banning the base characters would flag correct typography instead.
#   - U+200D, the zero-width joiner, which a review suggested. It would be wrong
#     here and will become more wrong: Devanagari uses ZWJ and ZWNJ to control
#     conjuncts, and DECISIONS §21 is 459 Hindi strings away from putting real
#     Devanagari in these files. A rule that reddens correct Hindi is worse than
#     the emoji it would catch, and U+FE0F already catches the sequences.
EMOJI_RANGES = [(0x1F000, 0x1FAFF), (0x2600, 0x27BF), (0xFE0F, 0xFE0F),
                (0x2B00, 0x2BFF), (0x231A, 0x231B), (0x23E9, 0x23FA)]
EXT = {".css", ".js", ".mjs", ".html"}


def strip_comments(text, is_css):
    """Blank out comments, keeping line numbers and line count intact.

    Replacing a comment with spaces rather than deleting it means a reported
    line number still points at the real line in the file.
    """
    out = list(text)
    i, n = 0, len(text)
    in_block = in_line = in_str = False
    quote = ""
    while i < n:
        two = text[i:i + 2]
        if in_block:
            if two == "*/":
                out[i] = out[i + 1] = " "
                i += 2
                in_block = False
                continue
            if text[i] != "\n":
                out[i] = " "
            i += 1
            continue
        if in_line:
            if text[i] == "\n":
                in_line = False
            else:
                out[i] = " "
            i += 1
            continue
        if in_str:
            if text[i] == "\\":
                i += 2
                continue
            if text[i] == quote or (quote != "`" and text[i] == "\n"):
                in_str = False
            i += 1
            continue
        if two == "/*":
            out[i] = out[i + 1] = " "
            i += 2
            in_block = True
            continue
        # `//` is a line comment in JS. In CSS it is not, and a bare `//` there
        # is almost certainly a URL, so only strip it outside stylesheets.
        if two == "//" and not is_css:
            in_line = True
            out[i] = out[i + 1] = " "
            i += 2
            continue
        if text[i] in "\"'`":
            in_str, quote = True, text[i]
            i += 1
            continue
        i += 1
    return "".join(out)


def is_emoji_cp(o):
    return any(lo <= o <= hi for lo, hi in EMOJI_RANGES)


def is_emoji(ch):
    return is_emoji_cp(ord(ch))


# AN EMOJI WRITTEN AS AN ESCAPE, which the character scan above cannot see --
# found 9 Nov 2026 by the probe suite in test_floor_check.py, on its first run,
# in the course of closing a different hole.
#
#     var t = 'done \u2705';
#
# is six ASCII characters on disk and a white heavy check mark at runtime. The
# scan reads source characters, so it said `✅ within the Chrome 109 floor`,
# and the office PC draws a grey box. Three spellings, all of them real:
# `\uXXXX` and `\u{...}` in JS, and HTML's numeric entities.
ESCAPED_EMOJI = re.compile(
    r"\\u\{([0-9a-fA-F]{1,6})\}"      # \u{1F600}
    r"|\\u([0-9a-fA-F]{4})"            # \u2705
    r"|\\x([0-9a-fA-F]{2})"            # \xFE (never an emoji, but cheap to read)
    r"|&#x([0-9a-fA-F]{1,6});"          # &#x2705;
    r"|&#([0-9]{1,7});"                 # &#9989;
)


def escaped_emoji_hits(line):
    """Code points in `line` written as an escape that are emoji."""
    out = []
    for m in ESCAPED_EMOJI.finditer(line):
        hexes = [m.group(i) for i in (1, 2, 3, 4)]
        dec = m.group(5)
        try:
            if dec is not None:
                cp = int(dec, 10)
            else:
                hit = next(h for h in hexes if h is not None)
                cp = int(hit, 16)
        except (ValueError, StopIteration):
            continue
        if is_emoji_cp(cp):
            out.append(m.group(0))
    return out


def files_under(targets):
    for t in targets:
        root = pathlib.Path(t)
        if root.is_file():
            if root.suffix in EXT:
                yield root
        elif root.is_dir():
            for f in sorted(root.rglob("*")):
                if f.is_file() and f.suffix in EXT:
                    yield f


def main(argv):
    targets = argv or ["v2"]
    hits = {}          # description -> [(file, line, text)]

    def note(desc, f, ln, line):
        hits.setdefault(desc, []).append((f, ln, line.strip()[:110]))

    for f in files_under(targets):
        try:
            raw = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        is_css = f.suffix == ".css"
        code = strip_comments(raw, is_css)
        for ln, line in enumerate(code.splitlines(), 1):
            for desc, pat in BANNED:
                if pat.search(line):
                    note(desc, f, ln, line)
            # `&` anywhere inside a stylesheet is nesting or the nesting
            # selector: there is no other use for it in CSS. `.js` is left
            # alone, where `&` is legal in a string and in bit arithmetic.
            if is_css and NESTING_AMP.search(line):
                note("CSS nesting — Chrome 112", f, ln, line)
        # Emoji are judged on the comment-stripped text, like everything else.
        #
        # They were judged on the RAW text at first, on the reasoning that an
        # emoji in a comment is harmless but one in a string is shipped, and
        # that telling those apart was harder than reporting both. The comment
        # stripper above disproves that, and the raw scan flagged nineteen
        # comments in db.js and sync.js the moment v2 took its copy. A checker
        # that cannot tell a shipped string from prose about one gets switched
        # off, and then it checks nothing.
        # Nesting WITHOUT an `&`, which no line regex can see. Whole-file.
        if is_css:
            for ln, sel in css_nesting_hits(code):
                note("CSS nesting — Chrome 112", f, ln, sel)
        for ln, line in enumerate(code.splitlines(), 1):
            if any(is_emoji(c) for c in line):
                note("emoji in source — Windows 7 renders a box", f, ln, line)
            esc = escaped_emoji_hits(line)
            if esc:
                note("emoji written as an escape — Windows 7 renders a box "
                     "(" + ", ".join(sorted(set(esc))[:4]) + ")", f, ln, line)

    print("── browser floor: Chrome 109 (Windows 7) ──")
    checked = sum(1 for _ in files_under(targets))
    if not hits:
        print(f"  {checked} file(s) checked, comments stripped first")
        print("──\n✅ within the Chrome 109 floor")
        return 0
    for desc, rows in hits.items():
        print(f"  ✗ {desc}")
        for f, ln, line in rows[:6]:
            print(f"      {f}:{ln}: {line}")
        if len(rows) > 6:
            print(f"      … and {len(rows) - 6} more")
    print("──")
    print(f"❌ {sum(len(r) for r in hits.values())} floor violation(s) in "
          f"{checked} file(s) — these render as nothing on the office PCs")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

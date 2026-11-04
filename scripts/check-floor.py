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
    ("Array.prototype.with — Chrome 110", re.compile(r"\]\s*\.with\s*\(")),
    ("Promise.withResolvers — Chrome 119", re.compile(r"\bPromise\.withResolvers")),
    ("Array.fromAsync — Chrome 121", re.compile(r"\bArray\.fromAsync")),
    ("String.isWellFormed — Chrome 111", re.compile(r"\.(isWellFormed|toWellFormed)\s*\(")),
]

# A nested rule, which Chrome 112 introduced. Only matched in .css, and only in
# its unambiguous shape: a line that begins with `&` followed by a selector
# character. `&` is legal inside a JS string, so .js is left alone.
NESTING = re.compile(r"^\s*&[\s.:>+~\[{]")

# Windows 7 never shipped the full emoji set, so an emoji in a rendered string
# is a grey box on an office PC. Icons here are inline SVG.
# Pictographs and dingbats only. The arrow block (U+2190-21FF) used to be in
# here and is now out: an arrow is not an emoji, Windows 7 renders -> and the
# rest from ordinary fonts, and including it flagged nineteen comments in the
# data layer that had been harmless for a year.
EMOJI_RANGES = [(0x1F000, 0x1FAFF), (0x2600, 0x27BF), (0xFE0F, 0xFE0F),
                (0x2B00, 0x2BFF)]
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


def is_emoji(ch):
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in EMOJI_RANGES)


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
            if is_css and NESTING.search(line):
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
        for ln, line in enumerate(code.splitlines(), 1):
            if any(is_emoji(c) for c in line):
                note("emoji in source — Windows 7 renders a box", f, ln, line)

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

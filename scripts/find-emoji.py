#!/usr/bin/env python3
"""Print `file:line:text` for every line containing an emoji codepoint.

Separate from the shell script because BSD grep has no -P, and the Perl-regex
form of this check exited quietly with no matches on macOS -- passing by doing
nothing. Ranges cover the pictographic blocks plus the variation selector and
the dingbats/misc-symbols blocks that Windows 7 renders as boxes.
"""
import sys, pathlib

RANGES = [(0x1F300, 0x1FAFF), (0x1F000, 0x1F2FF), (0x2600, 0x27BF),
          (0xFE0F, 0xFE0F), (0x2B00, 0x2BFF), (0x2190, 0x21FF)]
EXT = {".js", ".html", ".mjs"}


def is_emoji(ch):
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in RANGES)


def main(targets):
    hits = 0
    for t in targets or ["src"]:
        root = pathlib.Path(t)
        files = [root] if root.is_file() else sorted(root.rglob("*"))
        for f in files:
            if not f.is_file() or f.suffix not in EXT:
                continue
            try:
                lines = f.read_text(encoding="utf-8").splitlines()
            except (UnicodeDecodeError, OSError):
                continue
            for n, line in enumerate(lines, 1):
                if any(is_emoji(c) for c in line):
                    print(f"{f}:{n}:{line.strip()[:120]}")
                    hits += 1
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

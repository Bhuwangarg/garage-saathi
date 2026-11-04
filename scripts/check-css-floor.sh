#!/usr/bin/env bash
# ===========================================================================
# Garage Saathi — browser floor check.
#
# The office runs Windows 7, which cannot run anything newer than Chrome 109.
# Several of the office PCs are Core 2 Duos. So every feature below, however
# pleasant, renders as nothing on the machines the business actually uses all
# day -- and a CSS feature that does not parse fails silently, which is the
# worst way for this to be discovered.
#
# Versions verified against caniuse / Chrome developer docs, not from memory:
#   oklch() / oklab()        Chrome 111
#   color-mix()              Chrome 111
#   CSS nesting              Chrome 112 (and 120 for the bare-selector syntax)
#   relative colors          Chrome 119
#   light-dark()             Chrome 123
#   subgrid                  Chrome 117
#   @starting-style          Chrome 117
#   view transitions         Chrome 111
#   @scope                   Chrome 118
#   text-wrap: balance       Chrome 114
#   Object/Map.groupBy       Chrome 117
#   Array toSorted and kin   Chrome 110
#   Promise.withResolvers    Chrome 119
#
# Usage:  scripts/check-css-floor.sh [paths...]      (default: src/)
#
# Checks only the files it is given. It is NOT run over the v1 app.js, whose
# comments discuss several of these features by name -- a grep cannot tell a
# banned property from a comment explaining why it is banned.
#
# Exit 0 = within the floor. Exit 1 = something here will not render in 109.
# ===========================================================================
set -uo pipefail

TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=("src")

FAIL=0
hit() {   # hit <description> <grep-pattern>
  local desc="$1" pat="$2" out
  out="$(grep -rInE --include='*.css' --include='*.js' --include='*.html' -- "$pat" "${TARGETS[@]}" 2>/dev/null)"
  if [ -n "$out" ]; then
    printf '  ✗ %s\n' "$desc"
    printf '%s\n' "$out" | sed 's/^/      /' | head -8
    FAIL=$((FAIL + 1))
  else
    printf '  ✓ %s\n' "$desc"
  fi
}

printf '── browser floor: Chrome 109 (Windows 7) ──\n'

hit "no oklch() or oklab()"            'okl(ch|ab)\('
hit "no color-mix()"                   'color-mix\('
hit "no relative colour syntax"        '(rgb|hsl|oklch|lab)\(\s*from '
hit "no light-dark()"                  'light-dark\('
hit "no subgrid"                       'grid-template-(rows|columns)\s*:\s*subgrid'
hit "no @starting-style"               '@starting-style'
hit "no view transitions"              '(@view-transition|view-transition-name|document\.startViewTransition)'
hit "no @scope"                        '@scope[ {]'
hit "no text-wrap: balance or pretty"  'text-wrap\s*:\s*(balance|pretty)'
hit "no Object.groupBy / Map.groupBy"  '(Object|Map)\.groupBy\('
hit "no toSorted/toReversed/toSpliced" '\.(toSorted|toReversed|toSpliced)\('
hit "no Promise.withResolvers"         'Promise\.withResolvers'
hit "no Array.fromAsync"               'Array\.fromAsync'

# Nesting is the one that needs a parser, not a pattern: a bare `&` is legal in
# a selector string in JS and illegal as a nested rule in 109. We look only for
# the unambiguous shape -- a line inside a stylesheet that starts with `&`.
NEST="$(grep -rInE --include='*.css' '^\s*&[ .:>+~[]' "${TARGETS[@]}" 2>/dev/null)"
if [ -n "$NEST" ]; then
  printf '  ✗ no CSS nesting\n'; printf '%s\n' "$NEST" | sed 's/^/      /' | head -8
  FAIL=$((FAIL + 1))
else
  printf '  ✓ no CSS nesting\n'
fi

# Windows 7 never shipped the full emoji set, so an emoji in a rendered string
# is a grey box on an office PC. Icons are inline SVG here.
#
# Done in python, not grep: BSD grep has no -P, and a `grep -P` that is not
# there exits quietly with no matches -- so this check passed by doing nothing
# at all the first time it ran. A check that cannot fail is worse than no check.
EMOJI="$(python3 "$(dirname "$0")/find-emoji.py" "${TARGETS[@]}" 2>/dev/null)"
if [ -n "$EMOJI" ]; then
  N="$(printf '%s\n' "$EMOJI" | wc -l | tr -d ' ')"
  printf '  ✗ no emoji in rendered strings (%s line(s))\n' "$N"
  printf '%s\n' "$EMOJI" | sed 's/^/      /' | head -8
  FAIL=$((FAIL + 1))
else
  printf '  ✓ no emoji in rendered strings\n'
fi

printf '──\n'
if [ "$FAIL" -eq 0 ]; then
  printf '✅ within the Chrome 109 floor\n'; exit 0
fi
printf '❌ %s floor violation(s) — these render as nothing on the office PCs\n' "$FAIL"
exit 1

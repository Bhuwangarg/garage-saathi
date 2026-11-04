#!/usr/bin/env bash
# Chrome 109 floor check. The work is in check-floor.py; this wrapper exists
# because the pre-push hook, PIPELINE.md and the agent definitions all name this
# path, and a check nobody can find is a check nobody runs.
#
# It was a pile of greps once. That version reported three violations in ui/
# which were all comments saying "no oklch(), no color-mix()", and its emoji
# test used `grep -P`, which BSD grep does not have -- so that one passed by
# matching nothing. Both failures are why the real check strips comments first
# and does its own Unicode.
exec python3 "$(dirname "$0")/check-floor.py" "$@"

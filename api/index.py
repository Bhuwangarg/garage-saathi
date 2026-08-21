"""Vercel serverless entry for the Garage Saathi sync/GPS server.

Vercel's Python runtime looks for a module-level `app`, `application` or
`handler`. The real server lives in sync_server.py at the repo root, bundled via
`includeFiles` in vercel.json, so this module only has to expose it.

`handler` is declared as a SUBCLASS rather than `from sync_server import Handler
as handler`. The alias binds the name at runtime and works when imported by
hand, but Vercel's build step failed with "does not export a top-level app,
application, or handler variable" — its detector does not follow the aliased
import. A class statement named `handler` is unambiguous to both.
"""
import os
import sys

# The bundled sync_server.py sits at the project root, one level up from api/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sync_server import Handler as _Handler  # noqa: E402


class handler(_Handler):  # noqa: N801  (Vercel entry symbol — lowercase is required)
    pass

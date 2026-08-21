"""Vercel serverless entry for the Garage Saathi sync/GPS server.

Vercel's Python runtime looks for a module-level `BaseHTTPRequestHandler`
subclass named `handler`. The real server lives in sync_server.py at the repo
root (bundled via `includeFiles` in vercel.json); we just re-export its Handler.
All routes are rewritten to this single function (see vercel.json `rewrites`).
"""
import os
import sys

# The bundled sync_server.py sits at the project root, one level up from api/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sync_server import Handler as handler  # noqa: E402  (Vercel entry symbol)

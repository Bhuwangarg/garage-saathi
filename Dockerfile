# Garage Saathi, as a long-lived process.
#
# The server was always a stdlib ThreadingHTTPServer with a __main__ that binds a
# port; Vercel was the odd fit, and api/index.py exists only because its detector
# needs a module-level class named `handler`. This image runs the thing the way it
# was written, which is why bootstrap() finally executes at startup instead of
# being re-checked on every request.
#
# One image serves BOTH halves, exactly as Vercel does today: the PWA as static
# files and the API from the same origin. That matters more than it looks —
# sync.js's baseUrl() falls through to location.origin for the hosted app, so the
# origin that serves the page IS the API. Splitting them would reintroduce the
# CORS failure that sync.js:85-89 records.
FROM python:3.12-slim

# tini reaps zombies and forwards SIGTERM, so `fly deploy` and `fly machine
# restart` stop the server instead of waiting out a kill timeout. ThreadingHTTPServer
# spawns a thread per request and daemon threads for the WhatsApp webhook; without
# PID-1 signal handling those make shutdown slow and ragged.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code change does not reinstall psycopg and cryptography.
#
# Installed straight from requirements.txt to keep ONE source of truth. If the
# build ever fails here it will be on `libsql-experimental`, which is a Rust
# extension: it is DORMANT (imported only when TURSO_URL is set, and production
# uses Postgres via DATABASE_URL), so the fix is to drop that line from
# requirements.txt, not to add a Rust toolchain to this image.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 8766 is the server's own default; fly.toml's internal_port must match.
ENV PORT=8766 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8766

# -u as well as PYTHONUNBUFFERED: the startup banner and every print() in the
# request path are the only logs this server has, and a buffered stdout means
# `fly logs` shows nothing until the buffer fills.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-u", "sync_server.py"]

# Garage Saathi — sync + GPS + auth server.
# Stdlib-only Python; this image just runs the server and serves uploads.
FROM python:3.12-slim

WORKDIR /app
COPY sync_server.py .

# Persist the SQLite DB and uploaded photos to a mounted volume in production.
ENV DB_PATH=/data/sync.db \
    UPLOADS_DIR=/data/uploads
VOLUME ["/data"]

# PORT is provided by the host (Render/Fly/Railway). GPS_INGEST_TOKEN must be set
# as a secret in the host's dashboard — do NOT bake it into the image.
EXPOSE 8766
CMD ["python", "sync_server.py"]

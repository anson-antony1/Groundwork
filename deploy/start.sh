#!/bin/sh
# Hosted entrypoint (the Dockerfile's CMD): background jobs, then one uvicorn process serving the API
# and the built frontend. One worker on purpose: replay state and the rate limiter live in-process.
set -e
cd "$(dirname "$0")/.."

# Free instances have no persistent disk: keep the database in /tmp, reset on every restart.
export GROUNDWORK_DB_PATH="${GROUNDWORK_DB_PATH:-/tmp/groundwork.db}"

python -m deploy.bootstrap &

# --proxy-headers: behind Render's proxy, rate limiting must see each visitor's IP, not the proxy's.
exec uvicorn deploy.asgi:app --host 0.0.0.0 --port "${PORT:-8010}" --proxy-headers --forwarded-allow-ips='*'

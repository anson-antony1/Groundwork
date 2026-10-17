"""Production entrypoint for hosted Groundwork (Render): the backend, unchanged, plus the built frontend.

Both are served from one origin, so the browser calls /api/v1 on the same host and the backend's
localhost-only CORS list never matters. Run from the repo root:

    uvicorn deploy.asgi:app --proxy-headers --forwarded-allow-ips='*'
"""
from pathlib import Path

from starlette.middleware.gzip import GZipMiddleware

from backend.app.main import app
from deploy.spa import SpaStaticFiles

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"

# The sites list carries every observation and is polled every 5 s; gzip cuts it to a fraction.
app.add_middleware(GZipMiddleware, minimum_size=1024)
# Registered after every backend route, so /api/v1, /uploads, /docs and /openapi.json still win.
app.mount("/", SpaStaticFiles(directory=DIST), name="frontend")

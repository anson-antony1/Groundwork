"""Production entrypoint for hosted Groundwork (Render): the backend, unchanged, plus the built frontend.

Both are served from one origin, so the browser calls /api/v1 on the same host and the backend's
localhost-only CORS list never matters. Run from the repo root:

    uvicorn deploy.asgi:app --proxy-headers --forwarded-allow-ips='*'
"""
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.middleware.gzip import GZipMiddleware
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from backend.app.main import app

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"

# Paths the backend owns. An unknown one must stay the backend's JSON 404: an HTML index.html with
# status 200 would look like a successful API call to the frontend.
BACKEND_PREFIXES = ("api/", "uploads/")


class SpaStaticFiles(StaticFiles):
    """The built frontend; client-side routes such as /sites/DEMO-TRAY fall back to index.html."""

    async def get_response(self, path: str, scope: Scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path.startswith(BACKEND_PREFIXES):
                raise
            response = await super().get_response("index.html", scope)
        if path.startswith("assets/"):
            # Vite fingerprints everything under assets/, so a file there never changes.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif response.media_type == "text/html":
            response.headers["Cache-Control"] = "no-cache"
        return response


# The sites list carries every observation and is polled every 5 s; gzip cuts it to a fraction.
app.add_middleware(GZipMiddleware, minimum_size=1024)
# Registered after every backend route, so /api/v1, /uploads, /docs and /openapi.json still win.
app.mount("/", SpaStaticFiles(directory=DIST), name="frontend")

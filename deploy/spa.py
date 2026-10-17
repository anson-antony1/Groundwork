"""The built frontend as static files that also answer client-side routes. deploy/asgi.py mounts it."""
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

# Never answered with index.html. api/ and uploads/ belong to the backend, whose JSON 404 must stay: an HTML
# page with status 200 would look like a successful API call. A missing assets/ file is a screen file from an
# older deploy: a real 404 lets the open tab reload into the new build, where index.html would fail as a script.
NO_FALLBACK = ("api/", "uploads/", "assets/")


class SpaStaticFiles(StaticFiles):
    """Client-side routes such as /sites/DEMO-TRAY fall back to index.html."""

    async def get_response(self, path: str, scope: Scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path.startswith(NO_FALLBACK):
                raise
            response = await super().get_response("index.html", scope)
        if path.startswith("assets/"):
            # Vite fingerprints everything under assets/, so a file there never changes.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif response.media_type == "text/html":
            response.headers["Cache-Control"] = "no-cache"
        return response

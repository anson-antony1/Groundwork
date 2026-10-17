from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import briefings, demo, devices, events, health, policies, replay, reports, sensors, sites
from .api.responses import error_responses
from .config import API_PREFIX, API_VERSION, LOG_LEVEL, RATE_LIMIT_PER_MINUTE, UPLOADS_DIR
from .core.errors import register_exception_handlers
from .core.logging import configure_logging
from .core.middleware import RateLimitMiddleware, RequestContextMiddleware

ROUTERS = (health, sites, sensors, devices, reports, replay, briefings, events, policies, demo)


def create_app() -> FastAPI:
    configure_logging(LOG_LEVEL)
    app = FastAPI(
        title="Groundwork API",
        version=API_VERSION,
        description="Utility crew ground-access and hazard planning. Hackathon build; not certified safety guidance.",
    )
    register_exception_handlers(app)

    # Last added = outermost: CORS wraps everything so even 429s carry CORS headers.
    app.add_middleware(RateLimitMiddleware, limit_per_minute=RATE_LIMIT_PER_MINUTE)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )

    for module in ROUTERS:
        app.include_router(module.router, prefix=API_PREFIX, responses=error_responses(422, 429, 500))

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    return app


app = create_app()

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures"
UPLOADS_DIR = REPO_ROOT / "backend" / "uploads"
DATABASE_PATH = Path(os.getenv("GROUNDWORK_DB_PATH", REPO_ROOT / "backend" / "groundwork.db"))

API_VERSION = "0.2.0"
API_PREFIX = "/api/v1"

# Shared secret for the serial bridge. Override via env var for anything beyond local dev.
SENSOR_TOKEN = os.getenv("GROUNDWORK_SENSOR_TOKEN", "dev-sensor-token")


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


# Auth0. Off by default so the offline demo and tests run without a tenant; turn it off again if the
# venue network or Auth0 fails. With it off, every caller is a labeled demo user with both roles.
AUTH_ENABLED = _flag("GROUNDWORK_AUTH_ENABLED", "false")
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "https://groundwork-api")
AUTH0_ROLES_CLAIM = os.getenv("AUTH0_ROLES_CLAIM", "https://groundwork-api/roles")
SENSOR_PERMISSION = "write:sensors"
# Keep accepting the static sensor token even with Auth0 on, so the bridge's offline fallback still works.
ALLOW_STATIC_SENSOR_TOKEN = _flag("GROUNDWORK_ALLOW_STATIC_SENSOR_TOKEN", "true")

LOG_LEVEL = os.getenv("GROUNDWORK_LOG_LEVEL", "INFO")

# Per client IP. The bridge (~90 req/min) and a polling dashboard share one IP during the demo.
RATE_LIMIT_PER_MINUTE = int(os.getenv("GROUNDWORK_RATE_LIMIT_PER_MINUTE", "600"))

DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 500

DEMO_SITE_ID = "DEMO-TRAY"
DEMO_DEVICE_ID = "tray-01"

# A reading older than this (by server receive time) becomes stale and responds with UNKNOWN.
SENSOR_STALE_SECONDS = 15

MAX_PHOTO_BYTES = 5 * 1024 * 1024

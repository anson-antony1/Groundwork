import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures"
UPLOADS_DIR = REPO_ROOT / "backend" / "uploads"

API_VERSION = "0.2.0"
API_PREFIX = "/api/v1"

# Shared secret for the serial bridge. Override via env var for anything beyond local dev.
SENSOR_TOKEN = os.getenv("GROUNDWORK_SENSOR_TOKEN", "dev-sensor-token")

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

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures"
UPLOADS_DIR = REPO_ROOT / "backend" / "uploads"

# Shared secret for the serial bridge. Override via env var for anything beyond local dev.
SENSOR_TOKEN = os.getenv("GROUNDWORK_SENSOR_TOKEN", "dev-sensor-token")

DEMO_SITE_ID = "DEMO-TRAY"
DEMO_DEVICE_ID = "tray-01"

# A reading older than this (by server receive time) is treated as stale -> UNKNOWN.
SENSOR_STALE_SECONDS = 15

MAX_PHOTO_BYTES = 5 * 1024 * 1024

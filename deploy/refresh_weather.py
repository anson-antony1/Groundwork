"""Refresh fixtures/weather_snapshot.json without ever exposing a half-written file.

backend.scripts.fetch_weather writes the snapshot in place, while the API re-reads it whenever the
file's mtime changes (backend/app/services/weather.py). This points that script at a temp file in the
same folder and swaps it in with os.replace, which is atomic. On any failure the old snapshot stays.

    python -m deploy.refresh_weather              # refresh the real snapshot
    python -m deploy.refresh_weather --out PATH   # write somewhere else, e.g. to test locally
"""
import argparse
import os
import sys
import tempfile
from pathlib import Path

from backend.app.services.weather import SNAPSHOT_PATH as REAL_SNAPSHOT
from backend.scripts import fetch_weather


def refresh(target: Path) -> bool:
    fd, tmp = tempfile.mkstemp(prefix=".weather-", suffix=".json", dir=target.parent)
    os.close(fd)
    fetch_weather.SNAPSHOT_PATH = Path(tmp)
    try:
        fetch_weather.main()
        os.chmod(tmp, 0o644)  # mkstemp creates it owner-only; the snapshot it replaces is world-readable
        os.replace(tmp, target)
        return True
    except Exception as exc:  # network errors or upstream API changes: keep serving the old snapshot
        print(f"weather refresh failed, keeping the old snapshot: {exc!r}", file=sys.stderr, flush=True)
        Path(tmp).unlink(missing_ok=True)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh the weather snapshot atomically.")
    parser.add_argument("--out", type=Path, default=REAL_SNAPSHOT, help="where to write (default: the real snapshot)")
    args = parser.parse_args()
    sys.exit(0 if refresh(args.out.resolve()) else 1)


if __name__ == "__main__":
    main()

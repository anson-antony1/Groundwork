"""Regenerate the committed API contract: python -m backend.scripts.export_openapi

Run this after an intentional API change; tests fail if backend/openapi.json drifts from the code.
"""
import json
from pathlib import Path

from backend.app.main import app

OUT = Path(__file__).resolve().parents[1] / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUT.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")

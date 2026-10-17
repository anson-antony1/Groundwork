"""Demo policy thresholds. These are labeled demo values, not regulatory or engineering limits."""
import json

from ..config import REPO_ROOT, SENSOR_STALE_SECONDS

# Editable mat staging defaults (README file layout: policies/mats_defaults.json).
MAT_DEFAULTS = json.loads((REPO_ROOT / "policies" / "mats_defaults.json").read_text(encoding="utf-8"))

DEMO_POLICY = {
    "label": "DEMO POLICY - not regulatory limits or certified engineering values",
    "demo_tray_access": {
        "basis": "sensor-calibrated 0-100 moisture index on the demo tray only",
        # moisture_index below go_below -> GO; below mats_below -> MATS; otherwise NO_GO.
        "pickup": {"go_below": 60, "mats_below": 80},
        "heavy_truck": {"go_below": 40, "mats_below": 65},
    },
    "hazard_weights": {"rain": 0.25, "wind": 0.15, "heat": 0.20, "flood": 0.20, "storm": 0.20},
    "sensor_stale_seconds": SENSOR_STALE_SECONDS,
    "mat_defaults": MAT_DEFAULTS,
}

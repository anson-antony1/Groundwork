"""Demo policy thresholds. These are labeled demo values, not regulatory or engineering limits."""
import json

from ..config import REPO_ROOT, SENSOR_STALE_SECONDS
from .hazard import HAZARD_POLICY

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
    # Share of the 0-10 hazard score each factor can contribute, from HAZARD_POLICY's max points.
    # Flood and storm add no points: their NWS alerts force CAUTION/STOP_WORK directly (README P4/P5).
    "hazard_weights": {
        "rain": HAZARD_POLICY["rain_forecast_max_pts"] / 10,
        "wind": HAZARD_POLICY["gust_max_pts"] / 10,
        "heat": HAZARD_POLICY["heat_max_pts"] / 10,
        "flood": 0.0,
        "storm": 0.0,
    },
    "hazard_policy": {k: v for k, v in HAZARD_POLICY.items() if k != "ground"},
    "sensor_stale_seconds": SENSOR_STALE_SECONDS,
    "mat_defaults": MAT_DEFAULTS,
}

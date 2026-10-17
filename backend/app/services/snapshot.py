"""Per-site status: weather safety and per-vehicle ground access, kept as separate decisions."""
from datetime import datetime

from ..config import DEMO_DEVICE_ID, DEMO_SITE_ID
from ..state import Store
from .access import demo_tray_access
from .display import fresh_reading
from .sites import WEATHER_FIELDS

VEHICLES = ("pickup", "heavy_truck")


def site_snapshot(site: dict, store: Store, now: datetime) -> dict:
    is_demo = site["id"] == DEMO_SITE_ID

    if store.replay_active:
        weather_state, mode = "STOP_WORK", "replay"
    elif is_demo:
        # The tray has no live weather feed; it runs a calm-weather demo scenario.
        weather_state, mode = "NORMAL", "sensor_demo"
    else:
        # Connectors not built yet: unknown, never "safe".
        weather_state, mode = "UNKNOWN", "simulated"

    reading = fresh_reading(store, DEMO_DEVICE_ID, now) if is_demo else None
    moisture = reading.get("moisture_index") if reading else None
    access = {v: demo_tray_access(moisture, v) if is_demo else "UNKNOWN" for v in VEHICLES}

    effective = {}
    for v in VEHICLES:
        if weather_state == "STOP_WORK":
            effective[v] = "STOP_WORK"
        elif weather_state == "UNKNOWN":
            effective[v] = "UNKNOWN"
        elif is_demo and store.crew_flag_at is not None:
            effective[v] = "SUPERVISOR_REVIEW"
        else:
            effective[v] = access[v]

    missing = [] if is_demo else list(WEATHER_FIELDS)
    if is_demo and reading is None:
        missing.append("demo_tray_moisture")

    return {
        **site,
        "hazard_score": None,
        "weather_state": weather_state,
        "access_call": access,
        "effective_status": effective,
        "data_status": "sensor_demo" if is_demo else "not_fetched",
        "missing_fields": missing,
        "mode": mode,
        "evaluated_at": now.isoformat(),
    }

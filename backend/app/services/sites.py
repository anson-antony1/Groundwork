import json

from ..config import DEMO_SITE_ID, FIXTURES_DIR

DEMO_SITE = {
    "id": DEMO_SITE_ID,
    "name": "Demo tray (beacon)",
    # Approximate demo venue location; the tray is a tabletop demo, not a field site.
    "latitude": 29.6465,
    "longitude": -82.3480,
    "region": "Demo venue",
    "location_origin": "demo tray at the venue (approximate)",
}

# Inputs the hazard score needs. Until the Open-Meteo / USDA / NWS connectors exist,
# every field site reports all of these as missing (never as zero risk).
WEATHER_FIELDS = ["rain_7d", "rain_forecast", "gust_forecast", "apparent_temp", "nws_alerts", "usda_soil"]


def load_sites() -> list[dict]:
    """DEMO-TRAY plus whatever is in fixtures/sites_50.json, once that file exists."""
    sites = [DEMO_SITE]
    path = FIXTURES_DIR / "sites_50.json"
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        sites.extend(raw["sites"] if isinstance(raw, dict) else raw)
    return sites


def get_site(site_id: str) -> dict | None:
    return next((s for s in load_sites() if s["id"] == site_id), None)

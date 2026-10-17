"""Fetch wildfire and wildlife context for every field site: python -m backend.scripts.fetch_hazards_v1

Writes fixtures/hazards_snapshot.json, read by services/field_hazards.py (Sperry PlanIT brief):
- Wildfire: NIFC WFIGS current wildfire incident locations, one request for the whole country, keeping
  incidents not yet 100% contained. Per site: active incidents within 25 mi, and the nearest one's
  distance and name.
- Wildlife: iNaturalist observations of American alligator (taxon 26039) within 10 km in the last
  30 days, per site, paced at about one request a second as iNaturalist asks. Community data, unverified.
A source that fails leaves that site's value null (shown as missing), never zero. Each request is
retried a few times first.
"""
import json
import time
from datetime import timedelta
from pathlib import Path

import httpx

from backend.app.config import DEMO_SITE_ID, FIXTURES_DIR
from backend.app.core.clock import now_utc
from backend.app.services.field_hazards import distance_mi
from backend.app.services.sites import load_sites

SNAPSHOT_PATH = FIXTURES_DIR / "hazards_snapshot.json"
NIFC_URL = ("https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
            "WFIGS_Incident_Locations_Current/FeatureServer/0/query")
NIFC_REFERENCE = "https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-incident-locations"
INAT_URL = "https://api.inaturalist.org/v1/observations"
INAT_REFERENCE = "https://www.inaturalist.org/taxa/26039-Alligator-mississippiensis"
ALLIGATOR_TAXON = 26039
WILDFIRE_RADIUS_MI = 25.0
WILDLIFE_RADIUS_KM = 10
WILDLIFE_DAYS = 30
PAUSE_S = 1.1
ATTEMPTS = 3
USER_AGENT = "GroundWork-hackathon (SwampHacks XII)"


def _get(client, url: str, params: dict, pause: float) -> dict:
    last = None
    for _ in range(ATTEMPTS):
        try:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # retried, then raised
            last = exc
            time.sleep(pause)
    raise last


def active_fires(client, pause: float = PAUSE_S) -> list[dict]:
    """[{name, latitude, longitude}] for wildfires not yet fully contained."""
    payload = _get(client, NIFC_URL, {
        "where": "IncidentTypeCategory='WF' AND (PercentContained IS NULL OR PercentContained < 100)",
        "outFields": "IncidentName,PercentContained", "returnGeometry": "true", "outSR": 4326,
        "resultRecordCount": 2000, "f": "json"}, pause)
    if "features" not in payload:
        raise ValueError(f"NIFC response without features: {str(payload)[:120]}")
    return [{"name": (f["attributes"].get("IncidentName") or "").strip().title() or None,
             "latitude": f["geometry"]["y"], "longitude": f["geometry"]["x"]}
            for f in payload["features"] if f.get("geometry")]


def fires_near(site, fires: list[dict]) -> dict:
    near = sorted((distance_mi(site.latitude, site.longitude, f["latitude"], f["longitude"]), f["name"]) for f in fires)
    within = [(d, n) for d, n in near if d <= WILDFIRE_RADIUS_MI]
    return {"count": len(within), "nearest_mi": round(near[0][0], 1) if near else None,
            "nearest_name": near[0][1] if near else None}


def alligator_count(client, site, since: str, pause: float = PAUSE_S) -> int:
    payload = _get(client, INAT_URL, {"taxon_id": ALLIGATOR_TAXON, "lat": site.latitude, "lng": site.longitude,
                                      "radius": WILDLIFE_RADIUS_KM, "d1": since, "per_page": 0}, pause)
    return int(payload["total_results"])


def build(client=None, pause: float = PAUSE_S) -> dict:
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID]
    now = now_utc()
    own = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT})
    try:
        try:
            fires = active_fires(client, pause)
        except Exception as exc:
            print(f"WARNING: NIFC wildfire fetch failed ({type(exc).__name__}: {exc}); wildfire left missing")
            fires = None
        since = (now - timedelta(days=WILDLIFE_DAYS)).date().isoformat()
        result = {}
        for s in sites:
            try:
                wildlife = {"count": alligator_count(client, s, since, pause)}
            except Exception:
                wildlife = None
            result[s.id] = {"wildfire": None if fires is None else fires_near(s, fires), "wildlife": wildlife}
            time.sleep(pause)
    finally:
        if own:
            client.close()
    return {"source": "NIFC WFIGS current wildfire incidents + iNaturalist American alligator observations",
            "fetched_at": now.isoformat(), "wildfire_reference": NIFC_REFERENCE, "wildlife_reference": INAT_REFERENCE,
            "active_fires_nationwide": None if fires is None else len(fires), "sites": result}


def main(path: Path | None = None) -> None:
    target = path or SNAPSHOT_PATH
    snap = build()
    target.write_text(json.dumps(snap, indent=2) + "\n", encoding="utf-8", newline="\n")
    sites = snap["sites"].values()
    fire_ok = sum(v["wildfire"] is not None for v in sites)
    wild_ok = sum(v["wildlife"] is not None for v in sites)
    print(f"wrote {target}: {len(snap['sites'])} sites; wildfire checked {fire_ok}, wildlife checked {wild_ok}; "
          f"active fires nationwide {snap['active_fires_nationwide']}; "
          f"sites with a fire within 25 mi {sum(bool(v['wildfire'] and v['wildfire']['count']) for v in sites)}; "
          f"sites with alligator sightings {sum(bool(v['wildlife'] and v['wildlife']['count']) for v in sites)}")


if __name__ == "__main__":
    main()

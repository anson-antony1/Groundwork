"""Build fixtures/sites_50.json by geocoding Florida towns: python -m backend.scripts.build_sites

Each site is a town-centroid planning area, NOT a real utility work order or customer site.
Coordinates come from the Open-Meteo Geocoding API (GeoNames data), so they are verifiable.
"""
import json

import httpx

from backend.app.config import FIXTURES_DIR

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
ORIGIN = "Open-Meteo Geocoding API (GeoNames) town centroid; illustrative planning area, not a utility work site"

PLACES = [
    "Gainesville", "Ocala", "Jacksonville", "Tallahassee", "Pensacola", "Panama City", "Fort Walton Beach",
    "Lake City", "Live Oak", "Palatka", "Saint Augustine", "Daytona Beach", "DeLand", "Orlando", "Kissimmee",
    "Sanford", "Leesburg", "Lakeland", "Winter Haven", "Bartow", "Tampa", "St. Petersburg", "Clearwater",
    "Brooksville", "Sebring", "Lake Wales", "Melbourne", "Palm Bay", "Titusville", "Vero Beach", "Fort Pierce",
    "Port Saint Lucie", "Stuart", "Okeechobee", "West Palm Beach", "Boca Raton", "Fort Lauderdale", "Miami",
    "Homestead", "Key West", "Naples", "Fort Myers", "Cape Coral", "Punta Gorda", "Sarasota", "Bradenton",
    "Venice", "Arcadia", "Wauchula", "Clewiston", "Immokalee", "Crystal River", "Chiefland", "Perry",
    "Marianna", "Crestview", "Starke", "Palm Coast", "Inverness", "Madison",
]


def geocode(client: httpx.Client, name: str) -> dict | None:
    resp = client.get(GEOCODE_URL, params={"name": name, "count": 10, "countryCode": "US", "format": "json"})
    resp.raise_for_status()
    matches = [r for r in resp.json().get("results", []) if r.get("admin1") == "Florida"]
    return matches[0] if matches else None


def main() -> None:
    sites, skipped = [], []
    with httpx.Client(timeout=15) as client:
        for name in PLACES:
            hit = geocode(client, name)
            if hit is None:
                skipped.append(name)
                continue
            sites.append({
                "id": f"SITE-{len(sites) + 1:03d}",
                "name": f"{hit['name']}, FL area",
                "latitude": round(hit["latitude"], 5),
                "longitude": round(hit["longitude"], 5),
                "region": hit.get("admin2"),
                "location_origin": ORIGIN,
                "geonames_id": hit.get("id"),
            })
    FIXTURES_DIR.mkdir(exist_ok=True)
    out = FIXTURES_DIR / "sites_50.json"
    out.write_text(json.dumps({"selection": ORIGIN, "sites": sites}, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(sites)} sites to {out}; skipped (no Florida match): {skipped or 'none'}")


if __name__ == "__main__":
    main()

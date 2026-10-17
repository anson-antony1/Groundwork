"""Refresh the weather snapshot for all sites: python -m backend.scripts.fetch_weather"""
import json

from backend.app.config import DEMO_SITE_ID
from backend.app.core.clock import now_utc
from backend.app.services.sites import load_sites
from backend.app.services.weather import SNAPSHOT_PATH, fetch_observations


def main() -> None:
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID]
    fetched_at = now_utc()
    observations = fetch_observations(sites, fetched_at)
    complete = sum(all(o["value"] is not None for o in obs) for obs in observations.values())
    SNAPSHOT_PATH.write_text(json.dumps({
        "source": "Open-Meteo Forecast API",
        "fetched_at": fetched_at.isoformat(),
        "sites": observations,
    }, indent=2) + "\n", encoding="utf-8", newline="\n")
    # README section 4: report how many sites actually have data, not just map pins.
    print(f"wrote {SNAPSHOT_PATH}: {len(observations)}/{len(sites)} sites fetched, {complete} with complete weather")


if __name__ == "__main__":
    main()

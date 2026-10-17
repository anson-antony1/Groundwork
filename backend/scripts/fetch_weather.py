"""Refresh the weather snapshot for all sites: python -m backend.scripts.fetch_weather"""
import json

from backend.app.config import DEMO_SITE_ID
from backend.app.core.clock import now_utc
from backend.app.services.sites import load_sites
from backend.app.services.weather import SNAPSHOT_PATH, fetch_alerts_and_soil, fetch_observations


def main() -> None:
    sites = [s for s in load_sites() if s.id != DEMO_SITE_ID]
    fetched_at = now_utc()
    observations = fetch_observations(sites, fetched_at)
    extra_obs, details = fetch_alerts_and_soil(sites, fetched_at)
    for site_id, extra in extra_obs.items():
        observations[site_id] = observations[site_id] + extra
    complete = sum(all(o["value"] is not None for o in obs) for obs in observations.values())
    SNAPSHOT_PATH.write_text(json.dumps({
        "source": "Open-Meteo Forecast API + NWS alerts + USDA NRCS Soil Data Access",
        "fetched_at": fetched_at.isoformat(),
        "sites": observations,
        "details": details,
    }, indent=2) + "\n", encoding="utf-8", newline="\n")
    # README section 4: report how many sites actually have data, not just map pins.
    print(f"wrote {SNAPSHOT_PATH}: {len(observations)}/{len(sites)} sites fetched, {complete} with complete data")
    alerts_ok = sum(d["alerts"] is not None for d in details.values())
    soil_ok = sum(d["drainage"] is not None for d in details.values())
    print(f"NWS alerts checked: {alerts_ok}/{len(sites)}; USDA soil found: {soil_ok}/{len(sites)}")
    active = {sid: d["alerts"] for sid, d in details.items() if d["alerts"]}
    print(f"sites with active alerts: {len(active)}" + "".join(f"\n  {sid}: {ev}" for sid, ev in active.items()))
    failures = [(sid, e) for sid, d in details.items() for e in d["errors"]]
    if failures:
        print(f"WARNING: {len(failures)} NWS/USDA failures (recorded as missing -> UNKNOWN):")
        for sid, e in failures[:10]:
            print(f"  {sid}: {e}")


if __name__ == "__main__":
    main()

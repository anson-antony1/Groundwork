"""Attach the real NWS alerts that were active on a replay scenario's day.

Replays used to assume one simulated alert because the live NWS API has no history. The
Iowa Environmental Mesonet (IEM) archives every NWS VTEC product, so this script lists the
alerts active in the state during the scenario day (US Eastern), downloads each alert's area
(its storm-based polygon, or the counties/zones it was issued for), and records which replay
sites fell inside. storm_replay_v2 then runs each site through hazard.assess() with these
real alerts, so the existing rules decide STOP WORK, not an assumption.

  python -m backend.scripts.build_replay_alerts_v1                       # demo-storm: Milton, 2024-10-09
  python -m backend.scripts.build_replay_alerts_v1 --scenario calm-day   # 2024-07-15
  python -m backend.scripts.build_replay_alerts_v1 --dry-run             # print, write nothing
"""
import argparse
import json
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.app.config import FIXTURES_DIR
from backend.app.services.sites import load_sites
from backend.app.services.storm_replay_v2 import ALERT_FILES, scenario_file

IEM = "https://mesonet.agron.iastate.edu"
LOCAL_TZ = ZoneInfo("America/New_York")
HEADERS = {"User-Agent": "Groundwork-hackathon-replay/1.0"}


def get_json(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90) as r:
        return json.load(r)


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def day_window(day: str) -> tuple[datetime, datetime]:
    start = datetime.combine(date.fromisoformat(day), time.min, LOCAL_TZ)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def event_area(e: dict, t0: datetime, t1: datetime) -> list:
    """Polygons for one event during [t0, t1): the storm-based polygon when there is one, else the
    counties/zones whose own validity overlaps the window. Zone timing matters: a Tropical Storm
    Warning upgraded to a Hurricane Warning ends for that zone even while the event continues elsewhere."""
    query = (f"wfo={e['wfo']}&year={e['issue'][:4]}"
             f"&phenomena={e['phenomena']}&significance={e['significance']}&etn={e['eventid']}")
    features = get_json(f"{IEM}/geojson/vtec_event.py?{query}&sbw=1").get("features") or []
    if not features:
        zones = {u["ugc"]: u for u in get_json(f"{IEM}/json/vtec_event.py?{query}").get("ugcs", [])}
        features = [f for f in get_json(f"{IEM}/geojson/vtec_event.py?{query}").get("features") or []
                    if f.get("id") in zones
                    and parse_utc(zones[f["id"]]["utc_issue"]) < t1 and parse_utc(zones[f["id"]]["utc_expire"]) > t0]
    polygons = []
    for f in features:
        g = f.get("geometry") or {}
        if g.get("type") == "Polygon":
            polygons.append(g["coordinates"])
        elif g.get("type") == "MultiPolygon":
            polygons.extend(g["coordinates"])
    return polygons


def inside(lon: float, lat: float, polygon: list) -> bool:
    """Ray casting on the outer ring; holes are ignored (alert areas rarely have them)."""
    ring, hit, j = polygon[0], False, len(polygon[0]) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i][:2], ring[j][:2]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="demo-storm", help="demo-storm or calm-day")
    ap.add_argument("--state", default="FL", help="state whose NWS alerts to check")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    scenario_name = scenario_file(a.scenario)
    scenario = json.loads((FIXTURES_DIR / scenario_name).read_text(encoding="utf-8"))
    day = scenario.get("storm_day") or scenario.get("day")
    t0, t1 = day_window(day)
    coords = {s.id: (s.longitude, s.latitude) for s in load_sites()}
    sites = {sid: coords[sid] for sid in scenario["sites"] if sid in coords}

    listing = get_json(f"{IEM}/json/vtec_events_bystate.py?state={a.state}&year={day[:4]}")["events"]
    active = [e for e in listing if parse_utc(e["issue"]) < t1 and parse_utc(e["expire"]) > t0]
    print(f"{day} ({a.state}): {len(active)} NWS alerts active; checking {len(sites)} replay sites")

    with ThreadPoolExecutor(max_workers=6) as pool:
        areas = list(pool.map(lambda e: event_area(e, t0, t1), active))

    events, by_site, no_area = {}, {sid: [] for sid in sites}, 0
    for e, polygons in zip(active, areas):
        if not polygons:
            no_area += 1
            continue
        key = f"{e['wfo']}-{e['phenomena']}.{e['significance']}-{e['eventid']:04d}"
        hits = [sid for sid, (lon, lat) in sites.items() if any(inside(lon, lat, p) for p in polygons)]
        if not hits:
            continue
        events[key] = {
            "event": f"{e['ph_name']} {e['sig_name']}",
            "wfo": e["wfo"],
            "issued_at": iso(parse_utc(e["issue"])),
            "expires_at": iso(parse_utc(e["expire"])),
            "source_url": IEM + e["uri"],
        }
        for sid in hits:
            by_site[sid].append(key)

    names = Counter(events[k]["event"] for ids in by_site.values() for k in ids)
    print(f"{len(events)} alerts touch at least one site; {no_area} had no area in effect that day")
    print(f"sites with any alert: {sum(1 for ids in by_site.values() if ids)}/{len(by_site)}")
    for name, n in names.most_common():
        print(f"  {n:4} site-alert pairs  {name}")
    if a.dry_run:
        return

    label = scenario.get("label") or ("Hurricane Milton" if a.scenario == "demo-storm" else a.scenario)
    out = {
        "scenario_id": a.scenario,
        "day": day,
        "window_utc": [iso(t0), iso(t1)],
        "scenario_source": (
            f"{label}, {day}. Rain, gust and apparent-temperature values are real Open-Meteo archive data. "
            f"NWS alerts are the real warnings, watches and advisories active that day (US Eastern), from the "
            f"Iowa Environmental Mesonet NWS archive, matched to each site by warning polygon or alert zone."
        ),
        "source": {"name": "Iowa Environmental Mesonet NWS VTEC archive", "url": f"{IEM}/vtec/",
                   "fetched_at": iso(datetime.now(timezone.utc)), "state": a.state,
                   "alerts_active_in_state": len(active)},
        "events": dict(sorted(events.items())),
        "sites": by_site,
    }
    path = FIXTURES_DIR / ALERT_FILES[scenario_name]
    path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

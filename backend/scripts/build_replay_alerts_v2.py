"""Attach the real NWS alerts active on a replay scenario's day, for every site in the country.

v2 of build_replay_alerts_v1.py: instead of one state's alerts fetched alert by alert, it downloads
the Iowa Environmental Mesonet nationwide warnings export (KML, with each alert's polygon or zone and
that zone's own start/end) twice per day: alerts issued during the day, plus alerts already in effect
when the day began. Together those are exactly the alerts active at any time that day. Each replay site
is matched by point-in-polygon. Output format is unchanged, so storm_replay_v2 reads it as before.

  python -m backend.scripts.build_replay_alerts_v2                       # demo-storm: Milton, 2024-10-09
  python -m backend.scripts.build_replay_alerts_v2 --scenario calm-day   # 2024-07-15
  python -m backend.scripts.build_replay_alerts_v2 --dry-run             # print, write nothing
"""
import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone

from backend.app.config import FIXTURES_DIR
from backend.app.services.sites import load_sites
from backend.app.services.storm_replay_v2 import ALERT_FILES, scenario_file
from backend.scripts.build_replay_alerts_v1 import IEM, day_window, inside, iso, parse_utc

EXPORT = f"{IEM}/cgi-bin/request/gis/watchwarn.py"
KML = "{http://www.opengis.net/kml/2.2}"


def download_kml(params: dict) -> bytes:
    req = urllib.request.Request(f"{EXPORT}?{urllib.parse.urlencode({**params, 'accept': 'kml'})}",
                                 headers={"User-Agent": "Groundwork-hackathon-replay/2.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def stamp(prefix: str, dt: datetime) -> dict:
    return {f"year{prefix}": dt.year, f"month{prefix}": dt.month, f"day{prefix}": dt.day,
            f"hour{prefix}": dt.hour, f"minute{prefix}": dt.minute}


def placemarks(kml: bytes):
    """Yields (event_key, event_name, geometry_type, begin, end, source_url, polygons) per alert area.
    geometry_type is "P" for a storm-based polygon, "C" for a county/zone."""
    for pm in ET.fromstring(kml).iter(f"{KML}Placemark"):
        label = pm.findtext(f"{KML}name") or ""
        m = re.match(r"(\w+)\.(\w\w)\.(\w)\.(\d+) (.+)", label)
        if not m:
            continue
        wfo, phen, sig, etn, name = m.groups()
        begin, end = pm.findtext(f".//{KML}begin"), pm.findtext(f".//{KML}end")
        description = pm.findtext(f"{KML}description") or ""
        link = re.search(r'href="([^"]+)"', description)
        gtype = re.search(r"Geometry Type:\s*(?:</i></font>)?\s*(\w)", description)
        polygons = []
        for ring in pm.iter(f"{KML}outerBoundaryIs"):
            text = ring.findtext(f".//{KML}coordinates") or ""
            points = [tuple(float(v) for v in p.split(",")[:2]) for p in text.split()]
            if len(points) >= 3:
                polygons.append([points])
        if begin and end and polygons:
            yield (f"{wfo}-{phen}.{sig}-{int(etn):04d}", name, gtype.group(1) if gtype else "C",
                   parse_utc(begin), parse_utc(end),
                   link.group(1).replace("&amp;", "&") if link else f"{IEM}/vtec/", polygons)


def fetch_rows(t0: datetime, t1: datetime) -> list:
    """Every alert area active in [t0, t1): issued inside the window, plus in effect when it began."""
    issued_that_day = download_kml({**stamp("1", t0), **stamp("2", t1)})
    in_effect_at_start = download_kml({"timeopt": 2, **stamp("3", t0)})
    return [row for kml in (issued_that_day, in_effect_at_start) for row in placemarks(kml)]


def match(rows: list, sites: dict, t0: datetime, t1: datetime) -> tuple[dict, dict, int]:
    """Returns (events, alert keys per site, alert areas considered)."""
    # Storm-based warnings are listed as their polygon AND as each county they touched; the polygon
    # is the real warned area, so the county rows of those alerts are ignored.
    has_polygon = {row[0] for row in rows if row[2] == "P"}
    lons, lats = [x for x, _ in sites.values()], [y for _, y in sites.values()]
    events, by_site, seen = {}, {sid: [] for sid in sites}, set()
    for key, name, gtype, begin, end, url, polygons in rows:
        ident = (key, begin, end, repr(polygons[0][0][:3]))
        if ident in seen or not (begin < t1 and end > t0) or (gtype == "C" and key in has_polygon):
            continue
        seen.add(ident)
        xs = [x for poly in polygons for x, _ in poly[0]]
        ys = [y for poly in polygons for _, y in poly[0]]
        if max(xs) < min(lons) or min(xs) > max(lons) or max(ys) < min(lats) or min(ys) > max(lats):
            continue
        hits = [sid for sid, (lon, lat) in sites.items() if any(inside(lon, lat, p) for p in polygons)]
        if not hits:
            continue
        e = events.setdefault(key, {"event": name, "wfo": key.split("-")[0], "issued_at": iso(begin),
                                    "expires_at": iso(end), "source_url": url})
        e["issued_at"] = min(e["issued_at"], iso(begin))
        e["expires_at"] = max(e["expires_at"], iso(end))
        for sid in hits:
            if key not in by_site[sid]:
                by_site[sid].append(key)
    return events, by_site, len(seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="demo-storm", help="demo-storm or calm-day")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    scenario_name = scenario_file(a.scenario)
    scenario = json.loads((FIXTURES_DIR / scenario_name).read_text(encoding="utf-8"))
    day = scenario.get("storm_day") or scenario.get("day")
    t0, t1 = day_window(day)
    coords = {s.id: (s.longitude, s.latitude) for s in load_sites()}
    sites = {sid: coords[sid] for sid in scenario["sites"] if sid in coords}
    events, by_site, areas = match(fetch_rows(t0, t1), sites, t0, t1)

    names = Counter(events[k]["event"] for ids in by_site.values() for k in ids)
    print(f"{day}: {areas} NWS alert areas active nationwide; {len(sites)} replay sites")
    print(f"{len(events)} alerts touch at least one site; sites with any alert: "
          f"{sum(1 for ids in by_site.values() if ids)}/{len(by_site)}")
    for name, n in names.most_common(15):
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
        "source": {"name": "Iowa Environmental Mesonet NWS warnings export", "url": EXPORT,
                   "fetched_at": iso(datetime.now(timezone.utc)), "scope": "nationwide",
                   "alert_areas_active": areas},
        "events": dict(sorted(events.items())),
        "sites": by_site,
    }
    path = FIXTURES_DIR / ALERT_FILES[scenario_name]
    path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()

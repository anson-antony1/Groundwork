"""get_sites_us_v1.py - nationwide substations from OpenStreetMap -> sites.csv-style rows + fixtures/sites_us.json

  python get_sites_us_v1.py                 # ~5 per state, 50 states + DC (needs internet, ~5-10 min)
  python get_sites_us_v1.py --per-state 3   # smaller
  python get_sites_us_v1.py --states FL,TX  # subset

Writes fixtures/sites_us.json in the same shape as fixtures/sites_50.json. To use it, back up
sites_50.json and copy sites_us.json over it, then run: python -m backend.scripts.fetch_weather
Real OSM coordinates; NOT confirmed utility work sites. Storm-replay fixtures only cover the old Florida
sites, so new sites show no replay data until you build a replay for them.
"""
import argparse, json, ssl, time, urllib.parse, urllib.request
from pathlib import Path
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
             "https://overpass.private.coffee/api/interpreter"]
HEADERS = {"User-Agent": "GroundWork-hackathon/0.1", "Accept": "application/json"}
ORIGIN = "OpenStreetMap power substation (via get_sites_us_v1.py); coordinates are real, not a confirmed utility work site"
STATES = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
          "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
          "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
          "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
          "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
          "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
          "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
          "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
          "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
          "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"}


def query_state(name: str, limit: int):
    q = (f'[out:json][timeout:90];area["name"="{name}"]["admin_level"="4"]["boundary"="administrative"]->.a;'
         f'nwr["power"="substation"](area.a);out center {limit};')
    body = urllib.parse.urlencode({"data": q}).encode()
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=body, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                return json.loads(r.read().decode())["elements"]
        except Exception as e:
            print(f"  {url}: {type(e).__name__}: {e}")
            time.sleep(3)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-state", type=int, default=5)
    ap.add_argument("--states", default="")
    a = ap.parse_args()
    codes = [c.strip().upper() for c in a.states.split(",") if c.strip()] or list(STATES)
    sites, failed = [], []
    for code in codes:
        print(f"{code} ...")
        els = query_state(STATES[code], a.per_state * 4)
        if els is None:
            failed.append(code)
            continue
        n = 0
        for e in els:
            lat = e.get("lat") or (e.get("center") or {}).get("lat")
            lon = e.get("lon") or (e.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            name = (e.get("tags") or {}).get("name") or f"Substation {e['id']}"
            sites.append({"id": f"US-{len(sites) + 1:03d}", "name": name, "latitude": round(lat, 5),
                          "longitude": round(lon, 5), "region": code, "location_origin": ORIGIN,
                          "source_id": f"osm-{e['id']}"})
            n += 1
            if n >= a.per_state:
                break
        time.sleep(2)  # be polite to Overpass
    out = Path("fixtures/sites_us.json")
    out.write_text(json.dumps({"selection": ORIGIN, "sites": sites}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(sites)} sites to {out}; failed states: {failed or 'none'}")


if __name__ == "__main__":
    main()

"""get_sites.py - makes sites.csv

  python get_sites.py          # real substations from OpenStreetMap (needs internet)
  python get_sites.py --grid   # 50 generic Florida test points (weather-pipeline testing only)
"""
import csv
import ssl
try:  # macOS python.org builds often lack root certs; certifi fixes that
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BBOX = "28.3,-82.6,30.6,-80.9"   # south, west, north, east
LIMIT = 60
ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter",
             "https://overpass.private.coffee/api/interpreter"]
HEADERS = {"User-Agent": "AccessCall-hackathon/0.1", "Accept": "application/json"}


def fetch_osm():
    query = f'[out:json][timeout:90];nwr["power"="substation"]({BBOX});out center {LIMIT};'
    body = urllib.parse.urlencode({"data": query}).encode()
    for url in ENDPOINTS:
        for attempt in (1, 2):
            try:
                req = urllib.request.Request(url, data=body, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
                    raw = r.read().decode()
                return json.loads(raw)["elements"]
            except urllib.error.HTTPError as e:
                print(f"{url} attempt {attempt}: HTTP {e.code} {e.reason}")
            except Exception as e:
                print(f"{url} attempt {attempt}: {type(e).__name__}: {e}")
            time.sleep(3)
    return None


def write(rows):
    with open("sites.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "name", "lat", "lon", "soft_ground_length_ft"])
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} sites to sites.csv")


def grid_rows():
    lats = [27.4 + i * (30.4 - 27.4) / 9 for i in range(10)]
    lons = [-82.3 + j * (-81.2 + 82.3) / 4 for j in range(5)]
    rows, n = [], 1
    for la in lats:
        for lo in lons:
            rows.append({"id": f"grid-{n:02d}", "name": f"Grid test point {n}", "lat": round(la, 4),
                         "lon": round(lo, 4), "soft_ground_length_ft": 100})
            n += 1
    return rows


if __name__ == "__main__":
    if "--grid" in sys.argv:
        write(grid_rows())
        sys.exit()
    els = fetch_osm()
    if els is None:
        print("\nOpenStreetMap lookup failed. Try again in a minute, or run: python get_sites.py --grid")
        sys.exit(1)
    rows = []
    for e in els:
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        rows.append({"id": f"osm-{e['id']}", "name": e.get("tags", {}).get("name") or f"Substation {e['id']}",
                     "lat": round(lat, 5), "lon": round(lon, 5), "soft_ground_length_ft": 100})
    if not rows:
        print("No substations returned. Try --grid or widen BBOX.")
        sys.exit(1)
    write(rows)

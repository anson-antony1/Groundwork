"""Post fixtures/sensor_replay.csv as mode=sensor_replay. Simulated data.
--loop keeps posting so readings stay fresh (backend ignores readings older than 15 s).
Exits non-zero on any non-201 response."""
import argparse, csv, os, sys, time
from datetime import datetime, timezone
import httpx

p = argparse.ArgumentParser()
p.add_argument("--csv", default="fixtures/sensor_replay.csv")
p.add_argument("--api", default="http://localhost:8000")
p.add_argument("--device", default="tray-01")
p.add_argument("--site", default="DEMO-TRAY")
p.add_argument("--token", default=os.environ.get("GROUNDWORK_SENSOR_TOKEN"))
p.add_argument("--interval", type=float, default=2.0)
p.add_argument("--loop", action="store_true")
a = p.parse_args()
if not a.token:
    sys.exit("No sensor token: pass --token or set GROUNDWORK_SENSOR_TOKEN")
if a.interval > 10:
    sys.exit("--interval must be <= 10 s or readings go stale (limit is 15 s)")

FLOATS = ("raw_adc", "moisture_index", "light_raw", "light_index", "pressure_hpa", "temp_c")
with open(a.csv, newline="") as f:
    rows = list(csv.DictReader(f))
if not rows:
    sys.exit(f"{a.csv} has no rows")

seq = 0
with httpx.Client(timeout=10) as c:
    while True:
        for r in rows:
            seq += 1
            body = {"device_id": a.device, "site_id": a.site, "seq": seq,
                    "calibration": r["calibration"],
                    "recorded_at": datetime.now(timezone.utc).isoformat(),
                    "mode": "sensor_replay"}
            for k in FLOATS:
                if r.get(k, "") != "":
                    body[k] = float(r[k])
            resp = c.post(f"{a.api}/api/v1/sensors/readings", json=body,
                          headers={"Authorization": f"Bearer {a.token}"})
            if resp.status_code != 201:
                sys.exit(f"seq {seq}: HTTP {resp.status_code} {resp.text}")
            print(f"seq {seq}: ok  moisture={body.get('moisture_index')}")
            time.sleep(a.interval)
        if not a.loop:
            break

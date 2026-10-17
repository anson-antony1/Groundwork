# Hosting Groundwork on Render

Two free services, defined in [`render.yaml`](../render.yaml):

| Service | What it is | URL pattern |
|---|---|---|
| `groundwork` | The live app. One Docker container runs the FastAPI backend (unchanged) and serves the built frontend from the same origin. | `https://groundwork-XXXX.onrender.com` |
| `groundwork-demo` | The always-up fallback. The frontend in mock mode, as a static site with no backend. A "Try it" button opens the rehearsal controls. | `https://groundwork-demo-XXXX.onrender.com` |

Nothing under `backend/` changes. [`deploy/asgi.py`](asgi.py) imports `backend.app.main:app` and adds the built frontend.

## One-time setup

1. **Repo access:** Anson (repo owner) installs the Render GitHub app on `anson-antony1/Groundwork`, or makes Rishi an admin.
2. **Create the services:** In Render, choose **New → Blueprint** and pick the repo. Render reads `render.yaml` and creates both services on the `ui` branch.
3. **Gemini key:** When Render asks for `GEMINI_API_KEY`, paste a **new** key with a quota cap. The old keys were exposed (HANDOFF_v4). Without a key, briefings fall back to the template summary.
4. **Sensor token:** Render generates `GROUNDWORK_SENSOR_TOKEN`. The **Reset demo** dialog asks for it, and you can copy it from the service's Environment tab. The code default (`dev-sensor-token`) is public, which is why it's replaced.
5. **Switch branches after the merge:** Once the PR merges, change both services' branch to `main` in the dashboard, or edit `branch:` in `render.yaml`.

## What to expect on the free plan

- **Sleep:**
  - The live service sleeps after 15 minutes with no traffic, and the next visit takes about a minute to wake it.
  - Open the live URL 2 minutes before judges arrive.
  - The demo site never sleeps.
- **Resets:**
  - Each restart starts from a fresh database in `/tmp`: no crew reports and no saved briefings.
  - Uploaded photos also reset.
  - At boot, [`bootstrap.py`](bootstrap.py) refreshes the weather snapshot, then generates one briefing.
- **Weather:**
  - The snapshot is refreshed at boot and every 3 hours while awake ([`refresh_weather.py`](refresh_weather.py) swaps the file atomically).
  - If a refresh fails, the previous snapshot keeps being served and is flagged stale after 6 hours.
- **One shared server:** Replay is global, so anyone who starts a storm flips it for every visitor. The Replay screen says so.
- **No beacon:** The Arduino isn't attached, so DEMO-TRAY shows NO LINK. The beacon story lives on the demo site and at the table.

## Check a deploy

```sh
B=https://groundwork-XXXX.onrender.com
curl -s $B/api/v1/health                                  # JSON, status ok
curl -s -o /dev/null -w '%{http_code}\n' $B/sites/DEMO-TRAY   # 200: the app handles client-side routes
curl -s -w ' %{http_code}\n' $B/api/v1/nope                 # JSON 404, never the app's HTML
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/api/v1/demo/reset   # 401 without the token
```

## Run the hosted setup locally

Port 8000 may be taken on the demo laptop, so this uses 8010. From the repo root, with the backend requirements installed:

```sh
(cd frontend && VITE_API_MODE=live VITE_HOSTED=1 npm run build)
PORT=8010 GROUNDWORK_DB_PATH=/tmp/groundwork-local.db sh deploy/start.sh
```

Leave `GROUNDWORK_REFRESH_WEATHER` unset locally; with it set to `1`, the boot refresh rewrites the committed `fixtures/weather_snapshot.json`. To test a refresh without touching the fixture, run `python -m deploy.refresh_weather --out /tmp/weather.json`.

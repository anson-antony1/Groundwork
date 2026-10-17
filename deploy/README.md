# Hosting Groundwork on Render

Two free services, defined in [`render.yaml`](../render.yaml):

| Service | What it is | URL pattern |
|---|---|---|
| `groundwork` | The live app. One Docker container runs the FastAPI backend (unchanged) and serves the built frontend from the same origin. | https://groundwork-ifbr.onrender.com |
| `groundwork-demo` | The always-up fallback. The frontend in mock mode, as a static site with no backend. A "Try it" button opens the rehearsal controls. | https://groundwork-demo.onrender.com |

Nothing under `backend/` changes. [`deploy/asgi.py`](asgi.py) imports `backend.app.main:app` and adds the built frontend.

## One-time setup

1. **Repo access:** Anson (repo owner) installs the Render GitHub app on `anson-antony1/Groundwork`, or makes Rishi an admin.
2. **Create the services:** In Render, choose **New → Blueprint**, then pick the repo and the `main` branch. Render reads `render.yaml` and creates both services, which deploy from `main`.
3. **Gemini key:** When Render asks for `GEMINI_API_KEY`, paste a **new** key with a quota cap. The old keys were exposed (HANDOFF_v4). Without a key, briefings fall back to the template summary.
4. **Sensor token:** Render generates `GROUNDWORK_SENSOR_TOKEN`. The **Reset demo** dialog asks for it, and you can copy it from the service's Environment tab. The code default (`dev-sensor-token`) is public, which is why it's replaced.
5. **Link the two sites:** Render chooses the hostnames, and `groundwork.onrender.com` belongs to someone else. After the first deploy, copy each service's URL from its dashboard page, then set (Environment tab, no trailing slash):
   - on `groundwork`: `VITE_DEMO_URL` = the demo site's URL;
   - on `groundwork-demo`: `VITE_LIVE_URL` = the live app's URL.

   Saving starts a new build. Until then, `/welcome` hides the live-system chip and its beacon link stays on the same site. The social card uses the site's own address, which Render provides as `RENDER_EXTERNAL_URL`; set `VITE_PUBLIC_URL` if the card is missing.
6. **Deploys:** Both services rebuild on every push to `main`, including merged PRs. Each deploy restarts the live app and resets its data (see Resets below), so hold merges while judges are using it. The current Blueprint was created from `ui`, so Render reads `render.yaml` there; bring changes to that file into `ui` too.

## What to expect on the free plan

- **Sleep:**
  - The live service sleeps after 15 minutes with no traffic, and the next visit takes about a minute to wake it.
  - Wake the live URL at least 15 minutes before judges arrive, so the weather refresh can finish, or keep it awake overnight with an uptime pinger on `/api/v1/health` every 10 minutes.
  - The demo site never sleeps.
- **Resets:**
  - Each restart starts from a fresh database in `/tmp`: no crew reports and no saved briefings.
  - Uploaded photos also reset.
  - At boot, [`bootstrap.py`](bootstrap.py) writes a 6 PM plan straight to the database, so the 6 PM Brief is never empty, even with login on. It uses the template narrative, which keeps Gemini's free daily quota for supervisors pressing Generate.
- **Weather and hazards:**
  - At boot and every 3 hours while awake, `bootstrap.py` runs the backend's refreshers: weather ([`refresh_weather_loop_v2.py`](../backend/scripts/refresh_weather_loop_v2.py)), then wildfire and wildlife ([`refresh_hazards_loop_v1.py`](../backend/scripts/refresh_hazards_loop_v1.py)). After the first weather refresh it writes a fresh plan.
  - Each swaps its file in atomically and keeps the previous snapshot if a fetch fails. Weather is flagged stale 6 hours after it was fetched, hazards after 12.
  - A weather refresh takes about 2 minutes on a laptop. A restart starts it over, so merges in quick succession keep the live app on the committed snapshots.
  - The Render log shows `[bootstrap] weather refreshed` or `weather refresh failed: …` for each attempt.
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

Leave `GROUNDWORK_REFRESH_WEATHER` unset locally; with it set to `1`, the boot refreshes rewrite the committed `fixtures/weather_snapshot.json` and `fixtures/hazards_snapshot.json`. To test the weather refresh without touching the fixture, run `python -c 'from pathlib import Path; from backend.scripts.refresh_weather_loop_v2 import refresh_once; refresh_once(Path("/tmp/weather.json"))'`.

Tests for the deploy files: `python -m pytest deploy/tests`.

## Auth0 (crew and supervisor login)

The backend checks Auth0 tokens when `GROUNDWORK_AUTH_ENABLED=true`. With it off (the default), every caller is a demo user with both roles, and the site shows no login. The frontend reads the switch from `/api/v1/health` (`auth: "auth0"` or `"disabled"`) and hides supervisor-only buttons for crew and logged-out visitors only while it's on.

| Who | Can |
|---|---|
| Anyone | Read everything; start and stop replays |
| `crew` | Send crew reports |
| `supervisor` | Everything crew can, plus generate the 6 PM plan, plan mats and cost, review reports, clear the crew flag, reset the demo |

**On Render, service `groundwork` → Environment** (saving redeploys):

| Key | Value |
|---|---|
| `AUTH0_DOMAIN` and `VITE_AUTH0_DOMAIN` | your tenant domain, e.g. `groundwork-demo.us.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | the client ID of the "Groundwork Web" single-page app |
| `GROUNDWORK_AUTH_ENABLED` | `true` once the users and roles work; `false` to fall back |

`AUTH0_AUDIENCE` (`https://groundwork-api`) and `AUTH0_ROLES_CLAIM` come from `render.yaml`. The Auth0 API identifier must match the audience character for character; a trailing slash breaks every login with 401s.

**On the laptop**, put the same values in the repo's `.env` (backend) and `frontend/.env.local` (`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_API_MODE=live`), and add `http://localhost:5173` to the Auth0 app's callback, logout and web-origin URLs.

**If Auth0 or the venue network fails mid-demo**, set `GROUNDWORK_AUTH_ENABLED=false` (Render) or remove it from `.env` and restart (laptop). Everything works again without a login. The beacon bridge keeps using the sensor token either way.


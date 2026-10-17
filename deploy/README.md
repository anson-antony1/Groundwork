# Hosting Groundwork on Render

Two free services, defined in [`render.yaml`](../render.yaml):

| Service | What it is | URL pattern |
|---|---|---|
| `groundwork` | The live app. One Docker container runs the FastAPI backend (unchanged) and serves the built frontend from the same origin. | https://groundwork-ifbr.onrender.com |
| `groundwork-demo` | The always-up fallback. The frontend in mock mode, as a static site with no backend. A "Try it" button opens the rehearsal controls. | https://groundwork-demo.onrender.com |

Nothing under `backend/` changes. [`deploy/asgi.py`](asgi.py) imports `backend.app.main:app` and adds the built frontend.

## One-time setup

1. **Repo access:** Anson (repo owner) installs the Render GitHub app on `anson-antony1/Groundwork`, or makes Rishi an admin.
2. **Create the services:** In Render, choose **New → Blueprint** and pick the repo. Render reads `render.yaml` and creates both services on the `ui` branch.
3. **Gemini key:** When Render asks for `GEMINI_API_KEY`, paste a **new** key with a quota cap. The old keys were exposed (HANDOFF_v4). Without a key, briefings fall back to the template summary.
4. **Sensor token:** Render generates `GROUNDWORK_SENSOR_TOKEN`. The **Reset demo** dialog asks for it, and you can copy it from the service's Environment tab. The code default (`dev-sensor-token`) is public, which is why it's replaced.
5. **Link the two sites:** Render chooses the hostnames, and `groundwork.onrender.com` belongs to someone else. After the first deploy, copy each service's URL from its dashboard page, then set (Environment tab, no trailing slash):
   - on `groundwork`: `VITE_DEMO_URL` = the demo site's URL;
   - on `groundwork-demo`: `VITE_LIVE_URL` = the live app's URL.

   Saving starts a new build. Until then, `/welcome` hides the live-system chip and its beacon link stays on the same site. The social card uses the site's own address, which Render provides as `RENDER_EXTERNAL_URL`; set `VITE_PUBLIC_URL` if the card is missing.
6. **Switch branches after the merge:** Once the PR merges, change both services' branch to `main` in the dashboard, or edit `branch:` in `render.yaml`.

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


# Groundwork frontend

React + TypeScript + Vite + Tailwind + React Leaflet dashboard for Groundwork (SwampHacks XII).
It exists to make the §14 two-minute demo work; the root [README](../README.md) is the source of truth.

## Quick start

```bash
cd frontend
npm install
cp .env.example .env.local     # optional: defaults to mock mode
npm run dev                    # http://localhost:5173
```

No backend? It runs on the in-browser **mock** backend by default, and the banner says "Demo fixture — not live data".

## Mock vs live: the one-line switch

In `frontend/.env.local`:

```bash
VITE_API_MODE=live             # talk to the FastAPI backend (default: mock)
```

The dev server proxies `/api` and `/uploads` to `API_PROXY_TARGET` (default `http://localhost:8000`), so the
browser calls the API on its own origin: no CORS setup, and phones on the LAN can reach the backend too.
`VITE_API_BASE_URL` stays empty unless you deliberately skip the proxy. `VITE_*` values ship to the browser,
so never put tokens or keys in them.

If port 8000 is busy, run the backend elsewhere and point the proxy at it:

```bash
uvicorn backend.app.main:app --port 8010          # from the repo root
API_PROXY_TARGET=http://localhost:8010            # in frontend/.env.local
```

`npm run dev:mock` starts a second, always-mock instance on :5174. Keep it open as the §14.7 fallback if the
backend dies mid-demo; its banner makes clear it's a demo fixture.

## Phone (crew hazard report)

`npm run dev` listens on the LAN and prints a `Network:` URL. On the phone open
`http://<laptop-ip>:5173/report/DEMO-TRAY`. Phone and laptop must share a network (use a phone hotspot if the
venue Wi-Fi isolates devices).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 (LAN-visible, proxies the API) |
| `npm run dev:mock` | Always-mock standby instance on :5174 |
| `npm run check` | typecheck + lint + tests + production build (run before every commit) |
| `npm test` | Vitest unit tests |
| `npm run gen:api` | Regenerate `src/api/schema.gen.ts` and `endpoints.gen.ts` from `backend/openapi.json` |
| `npm run gen:mocks` | Rebuild the mock site fixture from `fixtures/` (read-only) |
| `npm run gen:basemap` | Rebuild the offline Florida basemap from `us-atlas` (public-domain Census boundaries) |
| `npm run shot -- <url> <out.png> [--size WxH] [--scale N] [--mobile] [--eval js]` | Exact-viewport screenshot via headless Chrome |
| `npm run rehearse` | With `npm run dev:mock` running: plays the §14 script and saves a screenshot per beat to `rehearsal/` |

After Aashita changes the API, run `npm run gen:api`, fix any type errors, and commit the generated files.
The types come straight from the backend's committed contract, so they can't silently drift.

## Rules the UI follows

- The UI never computes safety status, hazard scores, mat counts or costs. It sends inputs (e.g. `/evaluate`)
  and renders what the backend returns. The mock backend's rule logic lives only in `src/mocks/`, which UI code
  can't import (lint rule).
- STOP WORK overrides everything visually. UNKNOWN or stale data never looks green: stale views turn gray
  and say when they were last updated.
- Weather hazard and per-vehicle access are separate cards; switching vehicles never changes the hazard score.
- Missing values read "Missing", never 0. Every value shows its source, time and quality, using the exact
  README §15 labels (`src/domain/provenance.ts`, covered by tests).
- Status colors match the beacon (§5.6) and always come with an icon, a label and a marker shape.

## Hotkeys

`1` Map · `2` Demo tray · `3` Sensor lab · `4` Storm replay · `5` 6 PM brief · `V` toggle vehicle · `?` help ·
`Esc` collapse the STOP WORK takeover · `Shift+Alt+R` (or hold the logo 2 s) reset demo · `Shift+M` mock rehearsal panel.
Ignored while typing in a field.

## Demo day (README §14)

1. `frontend/.env.local`: `VITE_API_MODE=live`. Run the backend on :8000, or set `API_PROXY_TARGET` if that port is
   taken (on Rishi's laptop another app, RepairRecord, was using 8000).
2. One browser tab on the laptop, `http://localhost:5173`, zoomed for the back of the room; navigate with `1`–`5`.
3. Phone: `http://<laptop-ip>:5173/report/DEMO-TRAY` (same Wi-Fi or a phone hotspot).
4. Standby: `npm run dev:mock` on :5174. If the backend dies, switch tabs; its banner says "Demo fixture".
5. Between judge groups: `Shift+Alt+R`, enter the sensor token once per browser session, Reset. Until the backend adds
   `POST /api/v1/demo/reset`, the dialog ends any replay and resets the vehicle, and says what it couldn't clear.
6. No internet: map tiles fall back to the bundled Florida outline automatically (or press "Use offline basemap").
   Fonts, the basemap and the app itself are all local.

STOP WORK covering the demo tray or every site (a storm replay) takes over the screen for ~5 s, then stays as a red bar
and frame until the weather logic clears it. STOP at only some field sites shows a named bar instead.

## Layout

```
src/api/        contract types (generated), client, query hooks, live/replay context
src/domain/     status → label/icon/tone/shape, §15 labels, formatting (pure, unit-tested)
src/mocks/      stateful in-browser stand-in for the backend (mock mode only)
src/components/ shared UI: placards, cards, markers, beacon replica, shell
src/screens/    one folder per screen; /style is the living style tile
```

## Open questions for Aashita (contract gaps)

Resolved on main and wired up: `POST /demo/reset` (token-gated; the Reset dialog uses it), `DELETE …/crew-flag`
("Clear crew flag" in the Sensor Lab and the demo tray's "Why this call?"), `alert_events` and `hazard_explanation`
(hazard card and "Why this call?"), NWS/USDA observations (access basis, provenance), the sourced Milton replay.

Still open:

1. `/health` reports `usda_nrcs` and `nws` as `not_built` although every site now has USDA and NWS observations.
   The UI counts coverage from the observations instead; please update the health flags.
2. `/policies` still returns the old `hazard_weights` (rain 0.25…), but the README now says rain 4 + gusts 3 + heat 3.
   The UI no longer shows weights; please align `/policies` with `HAZARD_POLICY`.
3. README §3 says unknown weather/access → `SUPERVISOR_REVIEW`; the backend returns `UNKNOWN`. The UI handles both.
4. Per-site `mode` (LIVE / CACHED / REPLAY / SIMULATED / SENSOR DEMO markers) and a `priority_rank` shared with the
   briefing. Until then the list order mirrors `briefings._priority_key`.
5. No endpoint to confirm/correct an AI photo tag. Proposed `POST /api/v1/reports/{id}/review
   {category_user?, verification}` and `ai_status: pending|done|unavailable`. Is `severity` (README §7) in or out?
6. Sensor history caps at 500 rows (~8 min at 1 Hz). Needs `?since=` or downsampling, plus a backend
   `pressure_tendency` (UNKNOWN under 3 h).
7. Briefing: when Gemini succeeds the deterministic text is lost. Always return `deterministic_summary` + optional
   `narrative`; add `mat_staging[]` and `sources[]`.
8. Expose mat/cost defaults via `/policies`; until then UI defaults are labeled "Scenario assumption • adjustable".
9. OK to treat `backend/openapi.json` as the shared contract instead of `shared/contracts.ts`?
10. Optional: add `vehicle` to `DisplayOut` so the mirror needn't parse "HVY" from the LCD text, and
    `GET /replay/scenarios` if more than one storm is ever offered.

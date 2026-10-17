# HANDOFF v5 - GroundWork (Rithika's part)

Paste this whole file into a new Claude chat to resume. Last updated Sat Oct 17 2026 (afternoon, after the nationwide-sites and n8n work). Supersedes HANDOFF_v4.

## Project and team
GroundWork (Sperry challenge hackathon): tells a utility dispatcher at 6 PM which sites crews can safely reach tomorrow.
Repo: github.com/anson-antony1/Groundwork (owner Anson). Local: ~/Desktop/Groundwork (.venv inside).
Rithika: risk intelligence, 6 PM briefing (Gemini), NWS/USDA connectors, hazard/access logic. Aashita: FastAPI backend, mats/cost, SQLite, demo reset. Rishi: frontend. Anson: Arduino beacon, repo owner.
Each new Terminal: cd ~/Desktop/Groundwork && source .venv/bin/activate (ALWAYS be in the repo root before git commands; a stray "cd .." broke a commit once).

## Branch state (what is where)
- main: P1-P10 etc as in v4. P9 hours fields are merged on main.
- fix/health-connectors (pushed): /health now reports usda_nrcs and nws as ok from the snapshot; refreshed weather snapshot; get_sites_us_v1.py. Already merged INTO fix/ui-print-email.
- fix/ui-print-email (pushed, PR NOT confirmed opened): everything above plus
  - one "Prototype policy" disclaimer (top banner only), developer text removed from the mats footer
  - readable print (frontend/src/styles/print.css, AppShell print classes)
  - collapsible cards (Card collapsedByDefault): Event log, Data and sources, Replay log, How replay stays separate, Acknowledgment log
  - plain wording: "Beacon not connected" instead of serial_bridge.py text
  - map starts on the continental US (still zooms to the loaded sites)
  - briefing prompt: if every site is at stop work, say so in one sentence
  - n8n workflow: new "Email dispatcher" step (agent/n8n_briefing_v3.json)
  Open: https://github.com/anson-antony1/Groundwork/pull/new/fix/ui-print-email
- feature/us-sites (local only, branched from fix/ui-print-email, UNCOMMITTED changes): fixtures/sites_50.json now holds 60 Florida (SITE-xxx) + 240 other-state (US-xxx) sites = 300 field sites (301 with the demo tray); fixtures/weather_snapshot.json refreshed for all 300. Untracked: fixtures/sites_us.json, get_sites_us_v2.py, fixtures/sites_50.florida.bak (local rollback copy), health_connectors_fix.patch (junk, do not commit). Arkansas and Indiana have no sites (Overpass failed); fine to skip.

## Nationwide sites
- Sites are real OpenStreetMap substations (not confirmed utility work sites), ~5 per state, chosen as the first results Overpass returned (NOT random or representative). The old 60 Florida sites came from a fixed box around central Florida the same way.
- Weather snapshot: 300/300 fetched, 239 complete; NWS checked 300/300 (43 sites have active alerts: Freeze, Frost, Wind, Red Flag, Beach Hazards; these are not stop-work terms so they read as caution-level); USDA soil found 248/300 (about 52 UNKNOWN, expected). Snapshot goes stale after 6 hours.
- NOT yet checked in the browser with 301 sites: map, ranking, 6 PM Brief, Storm Replay. Storm replay only has data for SITE-001..060, so US- sites show STOP WORK during a replay by default. Offline basemap is Florida only.
- Rollback: git checkout main -- fixtures/sites_50.json (or cp fixtures/sites_50.florida.bak fixtures/sites_50.json). The snapshot can stay (it is keyed by site id; extra ids are ignored).

## n8n and the 6 PM email
- Verified: Execute on "Manual test" sends an email through Gmail SMTP (smtp.gmail.com, port 465, SSL, a Google APP PASSWORD, not the normal password). It calls POST http://127.0.0.1:8000/api/v1/briefings/generate and emails the summary plus a link to the 6 PM Brief tab.
- The website does NOT send email and is NOT connected to n8n. The Regenerate button only calls the backend. n8n is a separate program that calls the backend. Email goes out only when n8n runs the workflow (Manual test, or the 6 PM daily trigger).
- For 6 PM to fire automatically: n8n running (npx n8n, http://localhost:5678), workflow switched Active, backend running, laptop awake, and n8n's timezone set correctly (check it). Workflow ships inactive; keep it inactive around the demo.
- Each n8n run saves a new briefing at the top of the list (see demo prep step 1).
- The email test earlier said "240 sites unknown" only because it ran before the weather refresh finished; regenerate after the backend reads the new snapshot.
- Secrets: the Gmail app password lives in n8n only; never commit it. Revoke it at myaccount.google.com/apppasswords after the hackathon.

## Requirement status
- P1-P8, P11, P13: done.
- P9: done and fully verified (UI: Postpone $2,800 -> $3,400 with 8 h, $50, $25; modeled difference rose by $600).
- P10: done (photo reports work). AI image tagging NOT implemented (do not mention it).
- P12/P15: blocked. hardware/ (serial_bridge.py, firmware, calibration.json) is on NO remote branch. The message to Anson has NOT been confirmed sent: send it first.
- P14: not verified. Needs a timed offline run on main in live mode, wifi off, README 14.4, plus beacon steps with Anson.
- Tests: backend 71 pass (run with the server stopped). Frontend 153/155 on Rithika's machine; the 2 failures are src/api/replayContext.test.tsx and also fail on main (pass on another machine, so likely environment).

## How the decision is made (for judges)
- Inputs are real: Open-Meteo forecast, NWS alerts, USDA NRCS soil drainage.
- Weather hazard 0-10 from forecast rain, gusts, heat; active NWS thunderstorm/tornado/hurricane/flash flood/lightning warnings force STOP WORK. Ground access uses 7-day rain, tomorrow's rain, soil drainage, clay, with stricter limits for heavy truck than pickup.
- Thresholds are DEMO POLICY (policies in backend/app/services/hazard.py and policies.py), not from a validated research study. Say so. Honest line: real traceable inputs, transparent rules, thresholds are a configurable policy a utility would set from field data; screening tool, supervisor decides. Do not claim a study backs the numbers.
- Mat count: ceil(L*W / mat area) x layers x margin (10-25%); defaults in policies/mats_defaults.json are placeholders; dollar figures are typed in by the user, no AI.
- Capital One Nessie is not needed.
- Simulated: Milton replay warning, sensor replay values, demo tray moisture, cost figures.

## Sensor replay fallback (dashboard only)
- python scripts/replay_sensor_v2.py --loop --interval 2 --token dev-sensor-token. Posts simulated values as tray-01 ("Recorded demo" label, say "simulated" out loud). Does not drive the LCD, LEDs or buzzer. Never run with the real beacon plugged in. Keep --loop running (readings older than 15 s are ignored).
- Cleanup after any replay test, server stopped: cp backend/groundwork.db backend/groundwork.db.bak, then sqlite3 backend/groundwork.db "DELETE FROM sensor_readings WHERE mode = 'sensor_replay' AND calibration = 'simulated_replay_v1';". Expect history total 0, display code UNKNOWN. Never delete groundwork.db itself (saved briefings are the Gemini fallback). Delete groundwork.db.bak after the demo.

## Known problems to tell the team
- Anson: push hardware/ (or say which branch); send a real sensor_replay.csv if he has one.
- Aashita: health.py change is in the PR (connectors now ok).
- Rishi: PR touches frontend (collapsible Card, print.css, wording, map center); replayContext.test.tsx failure; "Recorded demo" label shows on simulated values; review P9 fields.
- README known-problems line about health "not_built" is now outdated.
- No way to delete a single crew report/photo (only Reset demo clears all; per-report delete needs a new endpoint plus API contract refresh; after the demo).

## Running locally
- Backend (own Terminal tab, leave open): cd ~/Desktop/Groundwork, source .venv/bin/activate, lsof -ti :8000 | xargs kill (ignore usage message if nothing runs), uvicorn backend.app.main:app --reload --port 8000. Wait for "Application startup complete." Check: curl -s http://localhost:8000/api/v1/health (expect sites_loaded 301 and nws/usda_nrcs ok).
- Frontend: cd ~/Desktop/Groundwork/frontend, VITE_API_MODE=live in frontend/.env.local (git-ignored), npm ci (not npm install), npm run dev, open http://localhost:5173. Mock: npm run dev:mock.
- Refresh weather (server stopped, takes several minutes for 300 sites): python -m backend.scripts.fetch_weather, then restart uvicorn. Do this shortly before the demo.
- After changing the backend schema: python -m backend.scripts.export_openapi, then npm run gen:api in frontend.
- Claude Desktop MCP: python agent/install_claude_desktop_v1.py, quit and reopen the app, backend running.

## Demo prep
1. Make the newest saved briefing a replay one: confirm one generate returns narrative_source llm, then replay/start, briefings/generate, replay/stop, online. Newest first at GET /api/v1/briefings. Never click Generate offline or twice; a call takes about 20 s. n8n runs and tests also add briefings, so do this LAST.
2. Warn Anson before any replay with the beacon plugged in (replays force STOP_WORK and re-arm the alarm).
3. Tell judges: replay weather is real Hurricane Milton data (Oct 2024), the warning is simulated, sensor replay values are simulated, thresholds are demo policy, sites are real substations but not confirmed work sites.
4. Refresh the weather snapshot, restart the backend, click Reset demo, confirm reports total 0. Clean sensor rows if a replay was tested.
5. Team message: warning simulated, AI tagging not implemented (do not mention), sensor replay simulated, hardware bridge and firmware missing (Anson), P9 fields added (Rishi to review), nationwide sites are an optional branch.

## After the hackathon
- DELETE ALL Gemini keys in AI Studio (pasted in chat and shell history); revoke the Gmail app password; keep .env at chmod 600, gitignored, with a private backup.
- Delete backend/groundwork.db.bak, fixtures/sites_50.florida.bak, and merged branches (git push origin --delete <branch>). Backend and ui branches belong to Aashita and Rishi.
- Optional: per-report delete, briefing verification step, rank sites by raw severity, multi-day outlook, US-wide offline basemap and storm replay data, a validation write-up for the thresholds.

## Gotchas
- Use new versioned file names for scripts, never overwrite. Paste commands one at a time. Do not paste placeholder paths or prompt lines. zsh rejects "#" comment lines and unquoted globs (quote '*.py'). macOS: use cat heredocs, not sed -i.
- Files from Claude download to ~/Downloads; check with ls ~/Downloads | grep <name> before git apply or cp.
- Run backend tests with the server stopped (test_demo.py failed once while uvicorn was running).

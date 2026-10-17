# HANDOFF v4 - GroundWork (Rithika's part)

Paste this whole file into a new Claude chat to resume. Last updated Sat Oct 17 2026 (afternoon). Supersedes all earlier handoffs.

## Project and team
GroundWork (Sperry challenge hackathon): tells a utility dispatcher at 6 PM which sites crews can safely reach tomorrow.
Repo: github.com/anson-antony1/Groundwork (owner Anson). Local: ~/Desktop/Groundwork (.venv inside).
Rithika: risk intelligence, 6 PM briefing (Gemini), NWS/USDA connectors, hazard/access logic. Aashita: FastAPI backend, mats/cost, SQLite, demo reset. Rishi: frontend. Anson: Arduino beacon, repo owner.
Each new Terminal: cd ~/Desktop/Groundwork && source .venv/bin/activate

## Where the code is
- main has: hazard score, NWS alert rules, per-vehicle access, Gemini briefing with template fallback, offline weather snapshot, Milton and calm-day replays, agent/ layer (MCP server, Claude Desktop installer, n8n v2 kept INACTIVE), P8 mat staging, sensor replay fallback (replay_sensor_v2.py, fixtures/sensor_replay.csv which is SIMULATED, fixtures/display_states.json), cleanup of old handoffs and dead files.
- Branch feature/p9-hours (pushed, PR NOT confirmed opened): P9 hourly cost inputs + README/handoff status updates (P9 and P10 marked done). Open: https://github.com/anson-antony1/Groundwork/pull/new/feature/p9-hours . Merge it before the demo, then delete the branch.
- Tests: 71 backend tests pass (run with the server stopped). Frontend: 153 of 155 pass. The 2 failures are in src/api/replayContext.test.tsx and fail the same way on main (pre-existing, not from P9). Untested guess: frontend/.env.local set to live mode. Tell Rishi.
- README is the long original spec by choice (do not shorten); it has a status section at the end.

## Requirement status
- P1-P8, P11, P13: done.
- P9: done on feature/p9-hours. New cost fields idle_hours, labor_rate_per_hour, equipment_rate_per_hour (default 0); postpone option adds idle_hours x (labor + equipment rate) on top of the flat dollar fields. API check passed (8 h, $50, $25 -> postpone 600). The UI check (Postpone total rises by $600) is still to do. Tell Rishi the field names (MatsCostPanel.tsx is his).
- P10: done, verified through the UI (report with photo submits, shows in the site's Crew Reports feed as UNREVIEWED, "crew report, not an official alert"). AI image tagging is NOT implemented (category_ai None; UI shows "AI suggestion unavailable"); a Gemini tagger was dropped because image calls took 10-15 s and often 504ed. The success message says "on the map": check the Ops map shows a pin.
- P12/P15: blocked. hardware/ (serial_bridge.py, Arduino firmware, calibration.json) is on NO remote branch. DEMO-TRAY shows UNKNOWN until readings arrive. The message to Anson asking him to push them has NOT been confirmed sent: send it first.
- P14: not verified. Needs a timed run on main in live mode with wifi off following README 14.4, plus beacon steps with Anson. API-only offline run passed earlier.

## Sensor replay fallback (dashboard only)
- python replay_sensor_v2.py --loop --interval 2 --token dev-sensor-token (token default; .env sets none). Posts the CSV as tray-01 with mode sensor_replay; the UI labels it "Recorded demo" but the values are SIMULATED. Say "simulated" out loud, or Rishi keys the label off calibration = simulated_replay_v1.
- Does not drive the LCD, LEDs or buzzer. Never run it with the real beacon plugged in. Readings older than 15 s are ignored, so keep --loop running.
- Demo thresholds (policies.py): heavy_truck GO below 40, MATS below 65, else NO GO; pickup 60 and 80. Loop test passed (GO -> MATS -> NOGO).
- Reset demo keeps sensor readings by design (the 42 simulated rows I created were deleted by hand). Cleanup after any replay test, with the server stopped: cp backend/groundwork.db backend/groundwork.db.bak, then sqlite3 backend/groundwork.db "DELETE FROM sensor_readings WHERE mode = 'sensor_replay' AND calibration = 'simulated_replay_v1';". Expect GET /api/v1/sensors/tray-01/history total 0 and display code UNKNOWN.
- backend/groundwork.db.bak exists (git-ignored via backend/*.bak). Delete it after the demo. Never delete groundwork.db itself (it holds saved briefings, the Gemini fallback).

## Known problems to tell the team
- Anson: push hardware/ (or say which branch), and send a real sensor_replay.csv if he has one.
- Aashita: backend/app/api/health.py reports usda_nrcs and nws as "not_built" although both work.
- Rishi: replayContext.test.tsx fails on main; "Recorded demo" label shows on simulated values; review the new P9 fields in the panel; "on the map" wording if no pin.
- 6 TEST crew reports are still in the DB (4 old + 2 from P10 checks). Click Reset demo in the UI and confirm GET /api/v1/reports total is 0. The last check still showed 6 (unclear whether Reset was clicked before it).

## Running locally
- Backend: uvicorn backend.app.main:app --reload --port 8000 (restart after changing .env or fixtures; port stuck: lsof -ti :8000 | xargs kill).
- Frontend live mode: cd frontend, VITE_API_MODE=live in frontend/.env.local (git-ignored), npm ci, npm run dev (http://localhost:5173). Mock: npm run dev:mock. Do not use npm install. After changing the backend schema: python -m backend.scripts.export_openapi, then npm run gen:api in frontend.
- Claude Desktop MCP: python agent/install_claude_desktop_v1.py, quit and reopen the app, backend running.

## Demo prep
1. Confirm one generate returns narrative_source llm, then make the newest saved briefing a replay one (replay/start, briefings/generate, replay/stop, online). Newest first at GET /api/v1/briefings. Never click Generate offline or twice. A briefing call takes about 20 s.
2. Warn Anson before any replay with the beacon plugged in: replays force the tray to STOP_WORK and re-arm the alarm.
3. Tell judges: replay weather is real Hurricane Milton data (Oct 2024); the warning is simulated; sensor replay values are simulated.
4. Click Reset demo and confirm reports total 0. Clean sensor rows (above) if a replay was tested.
5. Team message: warning is simulated, AI tagging is not implemented (do not mention it), sensor replay is simulated, health endpoint shows connectors as not_built, hardware bridge and firmware missing (Anson), P9 hours fields added (Rishi to review).

## After the hackathon
- DELETE ALL Gemini keys in AI Studio (pasted in chat and shell history). Keep .env at chmod 600, gitignored, with a private backup.
- Delete backend/groundwork.db.bak and merged branches (git push origin --delete <branch>). Backend and ui branches belong to Aashita and Rishi.
- Optional: briefing verification step, rank sites by raw severity, multi-day outlook, background image tagging.

## Gotchas
- Use new versioned file names for scripts, never overwrite. Paste commands only, not prompt lines or heredoc output. Do not paste placeholder paths. zsh rejects "#" comment lines and unquoted globs (quote '*.py'). macOS: use cat heredocs, not sed -i.
- Run tests with the server stopped (test_demo.py failed once while uvicorn was running).

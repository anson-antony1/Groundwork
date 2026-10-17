# HANDOFF v4 - GroundWork (Rithika's part)

Paste this whole file into a new Claude chat to resume. Written Sat Oct 17 2026, morning after the all-nighter. Supersedes v2 and v3.

## Project and team
GroundWork (Sperry challenge hackathon): tells a utility dispatcher at 6 PM which sites crews can safely reach tomorrow.
Repo: github.com/anson-antony1/Groundwork (owner Anson). Local: ~/Desktop/Groundwork (.venv inside).
Rithika: risk intelligence, 6 PM briefing (Gemini), NWS/USDA connectors, hazard/access logic. Aashita: FastAPI backend, mats/cost, SQLite, demo reset. Rishi: frontend. Anson: Arduino beacon, repo owner.
Each new Terminal: cd ~/Desktop/Groundwork && source .venv/bin/activate

## On main (68 backend tests pass; run tests with the server stopped)
- Hazard score, NWS alert rules (surf/rip-current stay visible but do not raise CAUTION), per-vehicle access, Gemini briefing with template fallback, offline weather snapshot.
- Replays: Milton (default start, all STOP_WORK) and calm-day (body {"scenario_id":"calm-day"}, 2024-07-15). Real archived weather; alerts SIMULATED or assumed.
- Agent layer in agent/: groundwork_mcp_v1.py (MCP server; needs pip install "mcp[cli]<2" httpx), install_claude_desktop_v1.py, n8n_briefing_v2.json (keep INACTIVE). groundwork_mcp_v2.py (sensor tool) was only drafted in chat.
- Rishi's frontend (frontend/), Aashita's P8 mat staging, README run guide and agent section.

## Branch docs/status-marks (pushed, PR NOT confirmed opened)
Open: https://github.com/anson-antony1/Groundwork/pull/new/docs/status-marks . Contains: P8 marked done; playbook fixes (replayed warning is SIMULATED with real weather data; removed the false "Gemini suggests a tag" claim); this handoff.

## Requirement status (README table on main: P1-P7, P11, P13 done)
- P8: VERIFIED via API (range 13-14 mats, steps, ft units, engineering caveat, editable layers 1-3, inputs change the result). Marked on docs/status-marks.
- P9: DONE in PR feature/p9-hours: idle_hours, labor_rate_per_hour and equipment_rate_per_hour added to the postpone side (idle_hours x (labor + equipment rate), on top of the flat amounts); backend tests pass. Still to do: UI check (8 h, $50, $25 raises the Postpone total by $600). Tell Rishi the three new field names.
- P10: DONE, verified through the UI (report with photo submits, shows in the site's Crew Reports feed as UNREVIEWED, "crew report, not an official alert"). AI image tagging is NOT implemented (reports.py sets category_ai None; UI shows "AI suggestion unavailable"). A Gemini tagger was tried and dropped: image calls took 10-15 s and often returned 504. Idea for later: tag in the background after saving. Success message says "on the map"; check the Ops map shows a pin.
- P12/P15: DEMO-TRAY shows UNKNOWN ("NO SENSOR DATA") because tray-01 has sent no readings; expected without the beacon. fixtures/sensor_replay.csv (simulated, not recorded) and fixtures/display_states.json now exist on main, and replay_sensor_v2.py --loop --interval 2 --token dev-sensor-token posts the CSV as tray-01 (dashboard only; do not run with the beacon plugged in). README says the unplugged fallback is hardware/serial_bridge.py --replay fixtures/sensor_replay.csv; check that hardware/ exists. Owners: Anson and Aashita.
- P14: not verified. Needs a timed run in live mode with wifi off following README 14.4, plus the beacon steps with Anson. API-only offline run passed earlier.

## Known problems to tell the team
- backend/app/api/health.py reports usda_nrcs and nws as "not_built" although both work: Aashita should fix.
- TEST reports (4 older ones plus 2 from the P10 checks) are still in the DB: click Reset demo in the UI and confirm GET /api/v1/reports total is 0.
- test_demo.py failed once while uvicorn was running (likely shares the live DB); run tests with the server stopped.

## Running locally
- Backend: uvicorn backend.app.main:app --reload --port 8000 (restart after changing .env or fixtures; port stuck: lsof -ti :8000 | xargs kill).
- Frontend live mode: cd frontend, put VITE_API_MODE=live in frontend/.env.local (git-ignored), npm ci, npm run dev (http://localhost:5173). Mock fallback with fake data: npm run dev:mock (port 5174). Do not use npm install (it rewrites package-lock.json).
- Claude Desktop MCP: python agent/install_claude_desktop_v1.py, quit and reopen the app, backend running.

## Demo prep
1. Confirm one generate returns narrative_source llm, then make the newest saved briefing a replay one (replay/start, briefings/generate, replay/stop, online). Newest first at GET /api/v1/briefings. Never click Generate offline or twice. A briefing call takes about 20 s; Gemini fell back to the template once overnight and recovered after a restart from the repo root.
2. Warn Anson before any replay with the beacon plugged in: replays force the tray to STOP_WORK and re-arm the alarm.
3. Tell judges: replay weather is real Hurricane Milton data (Oct 2024); the warning is simulated.
4. Team message to send: warning is simulated, AI tagging is not implemented (do not mention it), sensor replay is simulated although the UI labels it Recorded demo, health endpoint shows connectors as not_built, hardware/serial_bridge.py and the Arduino firmware are not in the repo (Anson to push), P9 hours fields added (Rishi to review the panel).

## After the hackathon
- DELETE ALL Gemini keys in AI Studio (pasted in chat and shell history). Keep .env at chmod 600, gitignored, with a private backup.
- Optional: briefing verification step, rank sites by raw severity, multi-day outlook, background image tagging.

## Gotchas
- Use new versioned file names for scripts, never overwrite. Paste commands only, not prompt lines. Do not paste placeholder paths.

## Hardware repo gap (found at the end)
hardware/ does not exist on main (ls hardware fails), so hardware/serial_bridge.py and the Arduino firmware are not in the repo. README 14 and the P12 fallback depend on serial_bridge.py --replay fixtures/sensor_replay.csv. Ask Anson to push them (or say which branch). Run: for b in $(git branch -r | grep -v HEAD); do git ls-tree -r --name-only $b | grep -qi "serial_bridge\|^hardware/" && echo $b; done

## Sensor replay cleanup
replay_sensor_v2.py (feature/sensor-fallback) leaves rows in sensor_readings; Reset demo keeps readings by design. Before the demo, with the server stopped: cp backend/groundwork.db backend/groundwork.db.bak, then sqlite3 backend/groundwork.db "DELETE FROM sensor_readings WHERE mode = 'sensor_replay' AND calibration = 'simulated_replay_v1';". Expect GET /api/v1/sensors/tray-01/history total 0 and display code UNKNOWN until a beacon or replay posts.

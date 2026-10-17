# HANDOFF v2 - GroundWork (Rithika's part)

Paste this whole file into a new Claude chat to resume. Written Sat Oct 17 2026, late night.

## Project and team
GroundWork (Sperry challenge hackathon): tells a utility dispatcher at 6 PM which sites crews can safely reach tomorrow.
Repo: github.com/anson-antony1/Groundwork (owner Anson). Local: ~/Desktop/Groundwork (.venv inside).
Rithika: risk intelligence, 6 PM briefing (Gemini), NWS/USDA connectors, hazard/access logic. Aashita: FastAPI backend, mats/cost, SQLite, demo reset. Rishi: frontend. Anson: Arduino beacon, repo owner.
Each new Terminal: cd ~/Desktop/Groundwork && source .venv/bin/activate

## What is on main (done)
- Hazard score 0-10 (rain 4 + gusts 3 + heat 3). NWS alert naming thunderstorm/tornado/hurricane/tropical storm/flash flood/flood warning forces STOP_WORK. Surf and rip-current advisories stay in alert_events but do not raise CAUTION. Failed alert check or missing forecast = UNKNOWN. Thresholds are DEMO POLICY.
- Per-vehicle access (pickup, heavy_truck) from ground-wetness indicators. A screening call, not measured bearing capacity.
- Gemini 6 PM briefing (about 20 s per call; template fallback offline). Weather snapshot works offline.
- P13 Hurricane Milton replay (2024-10-09): real Open-Meteo archive weather, SIMULATED hurricane warning. All sites STOP_WORK, score 7.0 (scale saturates).
- README risk-intelligence notes appear merged (8 README lines arrived via origin/main). Verify with: grep -n "Risk intelligence notes" README.md

## Open branches (NOT on main unless merged since)
- feature/calm-replay: pushed, PR not confirmed opened. Adds calm-day replay (2024-07-15: roughly 39 NORMAL, 21 CAUTION), scenario-aware replay, 8 new tests. Edits Aashita's replay.py and site_status.py: tell her. Start it with POST /api/v1/replay/start and body {"scenario_id":"calm-day"}. Default start (no body) is still Milton.
- feature/agent-layer: files in agent/ (optional, nothing imports them):
  - groundwork_mcp_v1.py: MCP server, 5 tools, tested in Inspector and in Claude Desktop. Needs: pip install "mcp[cli]<2" httpx (mcp 2.x renamed FastMCP and breaks it).
  - groundwork_mcp_v2.py: NOT created. Drafted in chat only (sensor_status tool plus replay scenario option); ask Claude to rewrite it.
  - install_claude_desktop_v1.py: adds the server to Claude Desktop config on macOS (backs up first). Quit and reopen the app. Claude Desktop points at v1.
  - n8n_briefing_v2.json: 6 PM briefing workflow. TESTED, works. Use v2 (127.0.0.1); v1 fails with ECONNREFUSED ::1. Keep it INACTIVE.
  - README agent layer and Running everything sections are written on feature/agent-layer. The stash named agent-readme is obsolete: git stash drop.

## Sensor facts
The beacon feeds only the DEMO-TRAY site (moisture reading, calm demo weather, crew flag). The 60 substations use forecast screening only. Any replay forces the tray to STOP_WORK and re-arms the physical alarm: warn Anson before replaying with the beacon plugged in. Endpoints: /api/v1/sensors/{device_id}/latest, /devices/{device_id}/display.

## Demo prep checklist
1. Generate a REPLAY briefing while online so the newest saved briefing is good (the n8n test added a plain one on top). With uvicorn running:
   curl -s -X POST http://localhost:8000/api/v1/replay/start > /dev/null
   curl -s -X POST http://localhost:8000/api/v1/briefings/generate | head -c 300
   curl -s -X POST http://localhost:8000/api/v1/replay/stop > /dev/null
   Check the order: GET /api/v1/briefings (newest first). Do not click Generate while offline.
2. Offline UI run (P14) with wifi off, through Rishi's frontend. API-only offline run already passed.
3. Do not hit /demo/reset after generating (may clear session data; not verified for briefings).
4. Tell judges: replay weather is real archived data, alerts are simulated or assumed.

## Open items
- Message Rishi: sites return hazard_explanation and alert_events; briefing generate takes about 20 s, needs a loading state. Ask for his frontend start command for the README.
- Ask teammates which of P8-P10, P12, P14, P15 are done. P8-P10 are Aashita and Rishi's lane.
- test_demo.py::test_demo_reset... failed once while uvicorn was running, passed with it stopped: likely shares the live DB. Tell Aashita. Run tests with the server stopped.
- Optional ideas: rank sites by raw severity (briefings.py), briefing verification step (narration.py), multi-day best-day outlook (touches Aashita's P9).
- After the hackathon: DELETE ALL Gemini keys in AI Studio (pasted in chat and shell history). Keep .env at chmod 600, gitignored, with a private backup.

## Gotchas
- Server: uvicorn backend.app.main:app --reload --port 8000. --reload does not watch .env or fixtures/: restart after changing them. Port stuck: lsof -ti :8000 | xargs kill
- Use new versioned file names for scripts, never overwrite.
- macOS: use python heredocs, not sed -i. Paste commands only, not prompt lines.

## n8n note
n8n workflow ran end to end, but that run returned narrative_source deterministic_template (no Gemini call, about 0.4 s). Before the demo, confirm a generate returns narrative_source llm, then regenerate a replay briefing so it is newest.


## OPEN ISSUE: Gemini fallback
Generate returned narrative_source deterministic_template instantly (also in replay, online, .env present). It returned llm at 05:17. Diagnose from the uvicorn log of one generate request (quota, bad key, or server started outside the repo root). Until fixed, do not click Generate: each run buries the good briefings. Fix, then regenerate a replay briefing so it is newest.

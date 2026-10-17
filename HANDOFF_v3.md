# HANDOFF v3 - GroundWork (Rithika's part)

Paste this whole file into a new Claude chat to resume. Written Sat Oct 17 2026, late night. Supersedes HANDOFF_v2.md.

## Project and team
GroundWork (Sperry challenge hackathon): tells a utility dispatcher at 6 PM which sites crews can safely reach tomorrow.
Repo: github.com/anson-antony1/Groundwork (owner Anson). Local: ~/Desktop/Groundwork (.venv inside).
Rithika: risk intelligence, 6 PM briefing (Gemini), NWS/USDA connectors, hazard/access logic. Aashita: FastAPI backend, mats/cost, SQLite, demo reset. Rishi: frontend (frontend/ is now in main). Anson: Arduino beacon, repo owner.
Each new Terminal: cd ~/Desktop/Groundwork && source .venv/bin/activate

## On main now (verified: 68 backend tests pass with the server stopped)
- Hazard score 0-10 (rain 4 + gusts 3 + heat 3). NWS alert naming thunderstorm/tornado/hurricane/tropical storm/flash flood/flood warning forces STOP_WORK. Surf and rip-current advisories stay in alert_events but do not raise CAUTION. Failed alert check or missing forecast = UNKNOWN. Thresholds are DEMO POLICY.
- Per-vehicle access from ground-wetness indicators (a screening call, not measured bearing capacity).
- Gemini 6 PM briefing (about 20 s; template fallback offline). Weather snapshot works offline.
- Replays: Milton (default start, all STOP_WORK, score 7.0) and calm-day (body {"scenario_id":"calm-day"}, 2024-07-15, mix of NORMAL and CAUTION). Weather is real archived data; alerts are SIMULATED or assumed.
- Aashita's P8 mat staging, Rishi's frontend, the MCP server, n8n workflows and README notes are merged. See frontend/README.md for the frontend start command.
- Agent layer in agent/: groundwork_mcp_v1.py (MCP server, 5 tools, works in Inspector and Claude Desktop; needs pip install "mcp[cli]<2" httpx), install_claude_desktop_v1.py, n8n_briefing_v2.json (tested end to end; v1 fails with ECONNREFUSED ::1; keep INACTIVE).
- groundwork_mcp_v2.py (sensor_status tool) was drafted in chat only and never created.

## Sensor facts
The beacon feeds only the DEMO-TRAY site. The 60 substations use forecast screening only. Any replay forces the tray to STOP_WORK and re-arms the physical alarm: warn Anson before replaying with the beacon plugged in.

## Demo checklist
1. Before the demo, confirm one generate returns narrative_source llm (it fell back to the template once tonight and recovered after a restart from the repo root). Then make the newest saved briefing a replay one: replay/start, briefings/generate, replay/stop, while online. GET /api/v1/briefings is newest first. Never click Generate offline or twice.
2. Offline UI run (P14) with wifi off through Rishi's frontend. The API-only offline run passed.
3. Do not hit /demo/reset after generating (not verified whether it clears briefings).
4. Tell judges: replay weather is real archived data, alerts are simulated or assumed.

## Open items
- Message Rishi and Aashita if not done: hazard_explanation and alert_events fields, 20 s generate needs a loading state, test_demo.py failed once while uvicorn was running (likely shares the live DB; run tests with the server stopped).
- Confirm with teammates which of P8-P10, P12, P14, P15 are done and mark the README rows. The frontend has screens for mat cost, reports, replay and sensors, but completion is unverified.
- Optional ideas: rank sites by raw severity, briefing verification step against computed facts, multi-day best-day outlook.
- After the hackathon: DELETE ALL Gemini keys in AI Studio (pasted in chat and shell history). Keep .env at chmod 600, gitignored, with a private backup. An old git stash named agent-readme can be dropped (git stash drop).

## Gotchas
- Server: uvicorn backend.app.main:app --reload --port 8000. --reload does not watch .env or fixtures/: restart after changing them. Port stuck: lsof -ti :8000 | xargs kill
- Use new versioned file names for scripts, never overwrite.
- macOS: use python heredocs, not sed -i. Paste commands only, not prompt lines.

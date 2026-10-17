# HANDOFF - where we left off (AccessCall, Rithika's module)

Paste this file into a new Claude chat to resume. Last updated: Fri Oct 16 2026.

## Project
AccessCall (Sperry challenge hackathon): proactive tool that tells a utility dispatcher at 6 PM which sites crews can
safely reach tomorrow. Rithika owns the risk-intelligence module and the 6 PM briefing. Teammates: Rishi (FastAPI
backend + deployment), Aashita (React frontend), Anson (live sensor demo). Priorities: proactive (not photo detection),
everything publicly accessible at the end (no HiPerGator, no local-only scripts), Gemini key only on the server.

## What exists (all in this folder, run on Rithika's Mac in ~/Desktop/Groundwork with a .venv)
- `get_sites.py`          makes sites.csv: real substations from OpenStreetMap (`--grid` = generic test points)
- `build_sites_json.py`   sites.csv -> sites.json (Open-Meteo rain + soil moisture, USDA soil drainage/clay, NWS alerts,
                          starter scoring rule, mats, vehicle, low/forecast/high-rain scenarios). `--offline` = fake data,
                          `--what-if-rain-in 2.0` = SIMULATED storm (clearly labeled) for demos
- `risk_intelligence.py`  ranks sites, uncertainty, warnings, staging totals (never invents numbers)
- `briefing.py`           `generate_briefing(data)`: deterministic fallback + Gemini rewrite; Gemini output rejected if it
                          contains numbers not in the plan; top 10 sites in detail, rest summarized
- `run_demo.py`           `python run_demo.py [--no-gemini] [file.json]`
- `tests/`                `python -m unittest discover tests` (9 tests, passing)

## Status
- Pipeline works end to end on REAL data: 60 Orlando-area substations (OSM) -> sites.json -> briefing. Backup saved as
  sites_backup.json (use this if venue Wi-Fi fails).
- Today's real forecast was dry (0.0 in rain), so all 60 sites came out GO (scores 0.2-3.4). That is correct but boring
  for a demo -> use `--what-if-rain-in` to show NO-GO/CAUTION behavior, labeled as a simulation.
- Gemini: NOT yet confirmed working. Key (Google AI Studio, starts "AQ.") authenticates, but model gemini-2.5-flash
  returned 404 "no longer available to new users". Default model in code/.env.example is now gemini-3.8-flash (the model
  the API's error message suggested; unverified). The fallback briefing works regardless.

## Immediate next steps
1. Fix Gemini: in `.env` set `GEMINI_MODEL=gemini-3.8-flash`, run `python run_demo.py sites.json`, last line should say
   `[source: gemini]`. If 404 again, list models available to the key:
   ```
   python - <<'PY'
   import os
   from dotenv import load_dotenv; load_dotenv()
   from google import genai
   for m in genai.Client(api_key=os.environ["GEMINI_API_KEY"]).models.list(): print(m.name)
   PY
   ```
   and put one of the printed names (without the "models/" prefix) in GEMINI_MODEL.
2. Make a stormy demo file: `python build_sites_json.py sites.csv --what-if-rain-in 2.0 -o sites_storm.json`
   then `python run_demo.py sites_storm.json`.
3. Tune the scoring rule with the team (constants at top of build_sites_json.py). Known issue: "poorly drained" soil
   alone gives 3 pts, so many sites sit at 3.3-3.4, just under the GO/CAUTION cutoff (3.5) even with no rain. Consider
   scaling soil points by recent wetness. Also 100 ft soft-ground length is a placeholder for every site (drives mats);
   ask for real access-path lengths. Mats = ceil(length/8 ft) x (0 GO, 1 CAUTION, 2 NO-GO) is an assumption.
4. Six sites had no USDA soil data (neutral soil assumed, flagged in data_quality). Fine for demo.
5. Hand off to Rishi: expose `generate_briefing(data)` as a backend endpoint (e.g. POST /briefing); he sets GEMINI_API_KEY
   (and GEMINI_MODEL) as server env vars. He also needs `pip install google-genai python-dotenv certifi`.
   Decide whether the backend runs build_sites_json.py live or serves a saved sites.json snapshot (safer for the demo).
6. Aashita adds a "Generate Tomorrow's Plan" button that shows the briefing text.
7. Test the full flow on the deployed site, not just the laptop.
8. Optional only if time: small forecasting model compared against a simple baseline; photo upload/text reports stay as a
   simple frontend feature (no ML).

## Gotchas learned
- zsh: don't paste lines starting with `#` (they run as commands) unless you ran `setopt interactive_comments`.
- macOS python.org Python needed certificates: fixed by certifi in the scripts (and Install Certificates.command).
- Open-Meteo soil layers used: soil_moisture_0_to_1cm, 1_to_3cm, 3_to_9cm, 9_to_27cm (thickness-weighted mean).
- Secrets: API keys were pasted in chat earlier; never commit .env; delete/regenerate keys after the hackathon.
  A Nessie (Capital One) key was also pasted; it is not used anywhere here.
- Each new Terminal: `cd ~/Desktop/Groundwork && source .venv/bin/activate`.

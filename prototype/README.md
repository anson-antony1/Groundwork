# GroundWork prototype - risk intelligence + 6 PM briefing

> **Historical.** This is the standalone first version of the briefing pipeline, written before the FastAPI
> backend existed. The live app does not import anything from this folder: the backend's versions are
> `backend/app/services/briefings.py`, `hazard.py`, `access.py` and `narration.py`. Kept for reference and
> because its tests still document the original input contract.

GroundWork is proactive: at 6 PM it tells a utility dispatcher which sites crews can safely reach tomorrow
(Sperry challenge hackathon). This folder was Rithika's first module: site data -> risk plan -> 6 PM briefing.

## Files
- `get_sites.py` - makes `sites.csv` (real substations from OpenStreetMap; `--grid` = generic test points)
- `build_sites_json.py` - `sites.csv` -> `sites.json` (Open-Meteo rain + soil moisture, USDA soil, NWS alerts, scoring rule, mats, scenarios)
  - `--offline` fake data for testing, `--what-if-rain-in 2.0` labeled storm SIMULATION for demos
- `risk_intelligence.py` - ranks sites, uncertainty, warnings, staging totals (never invents numbers)
- `briefing.py` - `generate_briefing(data)`: plain fallback briefing + Gemini rewrite, with safety checks
- `run_demo.py` - prints a briefing from a JSON file
- `sample_sites.json` - 3 DEMO sites (used by tests), `sites_template.csv` - example CSV
- `tests/` - `python -m unittest discover tests`
- `../docs/HANDOFF_v5.md` - status, decisions, next steps (read this to resume work)

## Setup (Mac)
```
cd ~/Desktop/Groundwork
python3 -m venv .venv
source .venv/bin/activate
pip install -r prototype/requirements.txt
cp .env.example .env   # at the repo root
cd prototype
```
Edit `.env`: `GEMINI_API_KEY=...` and `GEMINI_MODEL=gemini-3.8-flash`. Never commit `.env`.

## Everyday commands
```
python get_sites.py
python build_sites_json.py sites.csv -o sites.json
python run_demo.py sites.json
python build_sites_json.py sites.csv --what-if-rain-in 2.0 -o sites_storm.json
python run_demo.py sites_storm.json
python run_demo.py --no-gemini sites.json
python -m unittest discover tests
```

## Hand-off to Rishi (backend)
Expose `generate_briefing(data)` from `briefing.py` as e.g. `POST /briefing`; it returns
`{"text", "source": "gemini" | "fallback", "plan", "note"}`. Set `GEMINI_API_KEY` and `GEMINI_MODEL` as server
environment variables. Install `google-genai python-dotenv certifi`. The briefing always works without Gemini.

## Input JSON contract
See `sample_sites.json`. Per site: `id, name, hazard_score (0-10, higher = worse), verdict (GO/CAUTION/NO-GO),
weather_alerts[], contributing_factors[], mat_estimate{mats, vehicle}, data_quality_flags[]`, optional
`scenarios[{label, hazard_score, verdict}]`. Top level: `target_date, generated_at, is_demo, what_if, sites[]`.
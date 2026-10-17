from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import briefing, devices, events, policies, replay, reports, sensors, sites
from .config import FIXTURES_DIR, UPLOADS_DIR
from .envelope import envelope
from .services.sites import load_sites
from .state import store

app = FastAPI(title="Groundwork API", version="0.1.0")

# Vite dev server runs on a different port during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
for module in (sites, sensors, devices, reports, replay, briefing, events, policies):
    app.include_router(module.router, prefix=API_PREFIX)

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get(f"{API_PREFIX}/health", tags=["health"])
def health():
    fixtures = ["sites_50.json", "storm_replay.json", "sensor_replay.csv", "display_states.json"]
    data = {
        "status": "ok",
        "storage": "in-memory (resets on restart)",
        "sites_loaded": len(load_sites()),
        "replay_active": store.replay_active,
        "fixtures": {name: (FIXTURES_DIR / name).exists() for name in fixtures},
        "connectors": {"open_meteo": "not_built", "usda_nrcs": "not_built", "nws": "not_built"},
    }
    return envelope(data, "replay" if store.replay_active else "live")

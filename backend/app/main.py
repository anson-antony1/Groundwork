from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Groundwork API", version="0.1.0")

# Vite dev server runs on a different port during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health():
    return {
        "data": {"status": "ok"},
        "mode": "live",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": [],
        "missing_fields": [],
        "errors": [],
    }

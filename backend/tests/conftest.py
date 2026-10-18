import os
import tempfile

# Point the app at a throwaway database before it's imported, so tests never touch backend/groundwork.db.
os.environ["GROUNDWORK_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import repositories  # noqa: E402
from backend.app.config import SENSOR_TOKEN  # noqa: E402
from backend.app.main import app  # noqa: E402

AUTH = {"Authorization": f"Bearer {SENSOR_TOKEN}"}
TRAY = "/api/v1/devices/tray-01"


@pytest.fixture(autouse=True)
def _no_live_gemini(monkeypatch):
    """Tests never reach Gemini (slow, flaky, spends the real key): the client fails like a network error, so
    narration falls back to the template as it does offline. Key validation before the call still runs.
    A test that needs an LLM narrative patches narration itself."""
    from google import genai

    def offline(*_a, **_k):
        raise RuntimeError("Gemini is disabled in tests")
    monkeypatch.setattr(genai, "Client", offline)


@pytest.fixture
def client():
    repositories.reset_all()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def post_reading(client):
    def _post(moisture: float, **extra):
        body = {"device_id": "tray-01", "site_id": "DEMO-TRAY", "seq": 1, "raw_adc": 678, "moisture_index": moisture,
                "recorded_at": "2026-10-16T21:00:00-04:00", "mode": "sensor_demo", **extra}
        return client.post("/api/v1/sensors/readings", headers=AUTH, json=body)
    return _post


@pytest.fixture
def display(client):
    return lambda: client.get(f"{TRAY}/display").json()

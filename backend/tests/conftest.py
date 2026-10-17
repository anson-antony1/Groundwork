import pytest
from fastapi.testclient import TestClient

from backend.app import repositories
from backend.app.config import SENSOR_TOKEN
from backend.app.main import app

AUTH = {"Authorization": f"Bearer {SENSOR_TOKEN}"}
TRAY = "/api/v1/devices/tray-01"


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

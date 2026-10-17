"""Beacon barometer: 3-hour pressure tendency (README section 15) and history ?since=."""
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.services import pressure
from .conftest import AUTH

URL = "/api/v1/sensors/tray-01/pressure-tendency"


def post(client, minutes_ago: float, hpa: float, **extra):
    at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    body = {"device_id": "tray-01", "site_id": "DEMO-TRAY", "pressure_hpa": hpa, "temp_c": 24.0,
            "recorded_at": at.isoformat(), "mode": "sensor_demo", **extra}
    assert client.post("/api/v1/sensors/readings", headers=AUTH, json=body).status_code == 201


def log_series(client, start_hpa: float, end_hpa: float, hours: float = 3.1, step_min: int = 5, **extra):
    steps = int(hours * 60 / step_min)
    for i in range(steps + 1):
        post(client, minutes_ago=hours * 60 - i * step_min,
             hpa=start_hpa + (end_hpa - start_hpa) * i / steps, **extra)


def tendency(client):
    body = client.get(URL).json()
    assert "never a STOP WORK trigger" in body["data"]["advisory"]
    return body["data"]


def test_no_readings_is_unknown(client):
    t = tendency(client)
    assert t["tendency"] == "UNKNOWN" and t["change_hpa"] is None


def test_under_three_hours_is_unknown_not_steady(client):
    log_series(client, 1012.0, 1012.0, hours=2.0)
    t = tendency(client)
    assert t["tendency"] == "UNKNOWN"
    assert "needs 3 h" in t["reason"]


@pytest.mark.parametrize("start,end,expected", [
    (1012.0, 1012.0, "STEADY"),
    (1010.0, 1012.5, "RISING"),
    (1015.0, 1010.0, "FALLING_QUICKLY"),
])
def test_three_hour_change_is_classified(client, start, end, expected):
    log_series(client, start, end)
    t = tendency(client)
    assert t["tendency"] == expected
    assert t["start_at"] < t["end_at"]


def test_replayed_or_simulated_rows_never_make_a_trend(client):
    log_series(client, 1000.0, 1020.0, mode="sensor_replay", calibration="simulated_replay_v1")
    assert tendency(client)["tendency"] == "UNKNOWN"


def test_stale_beacon_is_unknown(client, monkeypatch):
    log_series(client, 1012.0, 1013.0)
    monkeypatch.setattr(pressure, "FRESH", timedelta(seconds=-1))
    assert "last 15 minutes" in tendency(client)["reason"]


def test_unknown_device_is_404(client):
    assert client.get("/api/v1/sensors/nope/pressure-tendency").status_code == 404


def test_history_since_filters_by_recorded_time(client):
    post(client, minutes_ago=30, hpa=1012.0)
    post(client, minutes_ago=5, hpa=1012.1)
    since = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    rows = client.get("/api/v1/sensors/tray-01/history", params={"since": since}).json()["data"]
    assert [r["pressure_hpa"] for r in rows] == [1012.1]
    naive = (datetime.now(timezone.utc) - timedelta(minutes=10)).replace(tzinfo=None).isoformat()
    assert len(client.get("/api/v1/sensors/tray-01/history", params={"since": naive}).json()["data"]) == 1

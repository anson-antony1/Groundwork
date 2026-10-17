"""Weather refresh v2: retries failed NWS checks, carries over only recent values, never invents data."""
import json
from datetime import datetime, timedelta, timezone

from backend.scripts import fetch_weather, refresh_weather_loop_v2 as loop

NOW = datetime(2026, 10, 17, 21, 0, tzinfo=timezone.utc)
DAY = "2026-10-17"


def obs(variable, value, fetched_at, valid_at=DAY):
    return {"variable": variable, "value": value, "unit": "x", "source": "s", "kind": "forecast", "valid_at": valid_at,
            "fetched_at": fetched_at.isoformat(), "quality": "available" if value is not None else "missing",
            "reference_url": None}


def snapshot(fetched_at, alerts_value, alerts=None, soil=None, rain=5.0):
    return {
        "source": "test", "fetched_at": fetched_at.isoformat(),
        "sites": {"S": [obs("rain_forecast", rain, fetched_at), obs("nws_alerts", alerts_value, fetched_at),
                        obs("usda_soil", soil, fetched_at)]},
        "details": {"S": {"alerts": alerts, "drainage": "poorly drained" if soil is not None else None,
                          "errors": [] if alerts is not None else ["nws: ReadTimeout"]}},
    }


def value(snap, variable):
    return next(o for o in snap["sites"]["S"] if o["variable"] == variable)


def test_recent_values_fill_gaps_and_keep_their_own_time():
    old = snapshot(NOW - timedelta(hours=1), 1.0, alerts=["Heat Advisory"], soil=3.0)
    new = snapshot(NOW, None, soil=None)
    assert loop.carry_over(new, old, NOW, loop.carry_max()) == 2
    assert value(new, "nws_alerts")["value"] == 1.0
    assert value(new, "nws_alerts")["fetched_at"] == (NOW - timedelta(hours=1)).isoformat()
    assert new["details"]["S"]["alerts"] == ["Heat Advisory"] and new["details"]["S"]["errors"] == []
    assert new["details"]["S"]["drainage"] == "poorly drained"
    # The snapshot is dated by its oldest weather value, so it can't look fresher than it is.
    assert loop.oldest_fetched_at(new) == (NOW - timedelta(hours=1)).isoformat()


def test_values_too_old_or_for_another_day_stay_missing():
    too_old = snapshot(NOW - loop.carry_max() - timedelta(minutes=1), 0.0, alerts=[])
    new = snapshot(NOW, None)
    assert loop.carry_over(new, too_old, NOW, loop.carry_max()) == 0
    assert value(new, "nws_alerts")["value"] is None  # stays UNKNOWN, never "no alerts"

    yesterday = snapshot(NOW - timedelta(hours=1), 0.0, alerts=[])
    for o in yesterday["sites"]["S"]:
        o["valid_at"] = "2026-10-16"
    assert loop.carry_over(new, yesterday, NOW, loop.carry_max()) == 0


def test_soil_carries_at_any_age_without_aging_the_snapshot():
    old = snapshot(NOW - timedelta(days=3), 0.0, alerts=[], soil=2.0)
    new = snapshot(NOW, 0.0, alerts=[], soil=None)
    assert loop.carry_over(new, old, NOW, loop.carry_max()) == 1
    assert value(new, "usda_soil")["value"] == 2.0
    assert loop.oldest_fetched_at(new) == NOW.isoformat()


def test_nothing_is_invented_when_neither_snapshot_has_the_value():
    new = snapshot(NOW, None)
    assert loop.carry_over(new, snapshot(NOW - timedelta(hours=1), None), NOW, loop.carry_max()) == 0
    assert loop.carry_over(new, None, NOW, loop.carry_max()) == 0
    assert value(new, "nws_alerts")["value"] is None


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class FlakyClient:
    """Fails the first NWS call (like a rate limit from Render's IP), then answers."""
    def __init__(self):
        self.calls = 0

    def get(self, url, params):
        self.calls += 1
        if self.calls == 1:
            raise ConnectionError("503 from api.weather.gov")
        return FakeResponse({"features": [{"properties": {"event": "Flood Watch"}}]})


class Site:
    id, latitude, longitude = "S", 27.0, -81.0


def test_retry_recovers_a_failed_alert_check():
    snap = snapshot(NOW, None)
    client = FlakyClient()
    assert loop.retry_alerts(snap, {"S": Site()}, attempts=3, pause=0, client=client) == 1
    assert client.calls == 2
    assert value(snap, "nws_alerts")["value"] == 1.0 and value(snap, "nws_alerts")["quality"] == "available"
    assert snap["details"]["S"]["alerts"] == ["Flood Watch"] and snap["details"]["S"]["errors"] == []


def test_refresh_keeps_good_data_from_the_previous_snapshot(tmp_path, monkeypatch):
    now = datetime.now(timezone.utc)
    target = tmp_path / "weather_snapshot.json"
    target.write_text(json.dumps(snapshot(now - timedelta(hours=1), 0.0, alerts=[], soil=1.0)))

    def fetch():
        fetch_weather.SNAPSHOT_PATH.write_text(json.dumps(snapshot(now, None, soil=1.0)), encoding="utf-8")

    monkeypatch.setattr(fetch_weather, "main", fetch)
    assert loop.refresh_once(target, retry=False) is True
    result = json.loads(target.read_text())
    assert value(result, "nws_alerts")["value"] == 0.0  # carried, not lost to UNKNOWN
    assert result["fetched_at"] == (now - timedelta(hours=1)).isoformat()
    assert list(tmp_path.iterdir()) == [target]  # no temp files left behind


def test_failed_refresh_keeps_the_previous_snapshot(tmp_path, monkeypatch):
    original_path = fetch_weather.SNAPSHOT_PATH
    target = tmp_path / "weather_snapshot.json"
    target.write_text(json.dumps({"fetched_at": "old", "sites": {"S": []}}))

    def boom():
        raise ConnectionError("Open-Meteo down")

    monkeypatch.setattr(fetch_weather, "main", boom)
    assert loop.refresh_once(target, retry=False) is False
    assert json.loads(target.read_text())["fetched_at"] == "old"
    assert fetch_weather.SNAPSHOT_PATH == original_path

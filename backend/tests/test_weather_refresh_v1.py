"""The hosted weather refresh swaps the snapshot atomically and keeps the old one on failure."""
import json

from backend.scripts import fetch_weather, refresh_weather_loop_v1 as loop


def fake_main(payload):
    def write():
        fetch_weather.SNAPSHOT_PATH.write_text(json.dumps(payload), encoding="utf-8")
    return write


def test_successful_refresh_replaces_the_snapshot(tmp_path, monkeypatch):
    target = tmp_path / "weather_snapshot.json"
    target.write_text(json.dumps({"fetched_at": "old", "sites": {"S": []}}))
    monkeypatch.setattr(fetch_weather, "main", fake_main({"fetched_at": "new", "sites": {"S": [], "T": []}}))
    assert loop.refresh_once(target) is True
    assert json.loads(target.read_text())["fetched_at"] == "new"
    assert list(tmp_path.iterdir()) == [target]  # no temp files left behind


def test_failed_or_empty_refresh_keeps_the_old_snapshot(tmp_path, monkeypatch):
    original_path = fetch_weather.SNAPSHOT_PATH
    target = tmp_path / "weather_snapshot.json"
    target.write_text(json.dumps({"fetched_at": "old", "sites": {"S": []}}))
    monkeypatch.setattr(fetch_weather, "main", fake_main({"fetched_at": "new", "sites": {}}))
    assert loop.refresh_once(target) is False

    def boom():
        raise ConnectionError("Open-Meteo down")

    monkeypatch.setattr(fetch_weather, "main", boom)
    assert loop.refresh_once(target) is False
    assert json.loads(target.read_text())["fetched_at"] == "old"
    assert list(tmp_path.iterdir()) == [target]
    assert fetch_weather.SNAPSHOT_PATH == original_path  # module path restored after each run

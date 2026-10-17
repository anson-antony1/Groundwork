"""Replays use the real NWS alerts archived for the scenario day (fixtures/*_alerts_v1.json)."""
import json

import pytest

from backend.app.config import FIXTURES_DIR
from backend.app.services import storm_replay_v2
from backend.app.services.storm_replay_v2 import ALERT_FILES, replay_site_v2, scenario_source


@pytest.mark.parametrize("scenario_file", sorted(ALERT_FILES))
def test_alert_files_cover_every_replay_site_and_cite_the_archive(scenario_file):
    scenario = json.loads((FIXTURES_DIR / scenario_file).read_text())
    archived = json.loads((FIXTURES_DIR / ALERT_FILES[scenario_file]).read_text())
    assert set(archived["sites"]) == set(scenario["sites"])  # "no alerts" is explicit, never missing
    for ids in archived["sites"].values():
        assert set(ids) <= set(archived["events"])
    for e in archived["events"].values():
        assert e["source_url"].startswith("https://mesonet.agron.iastate.edu/vtec/")
        assert e["issued_at"] < e["expires_at"]
    assert "SIMULATED" not in archived["scenario_source"]


def test_milton_alerts_are_real_and_drive_stop_work():
    r = replay_site_v2("SITE-001", "demo-storm")
    assert r["weather_state"] == "STOP_WORK"
    assert any("archived" in note for note in r["explanation"])
    assert "simulated" not in scenario_source("demo-storm").lower()


def test_calm_day_site_without_alerts_is_judged_on_weather_alone():
    archived = json.loads((FIXTURES_DIR / "replay_calm_alerts_v1.json").read_text())
    quiet = next(sid for sid, ids in archived["sites"].items() if not ids)
    r = replay_site_v2(quiet, "calm-day")
    assert r["alert_events"] == ()
    assert r["weather_state"] in ("NORMAL", "CAUTION")
    assert "NWS alerts at this site that day (archived): none" in r["explanation"]


def test_without_an_alert_file_the_old_simulated_behavior_remains(monkeypatch):
    monkeypatch.setitem(storm_replay_v2.ALERT_FILES, "storm_replay.json", "no_such_alerts_file.json")
    storm_replay_v2._load.cache_clear()
    try:
        r = replay_site_v2("SITE-001", "demo-storm")
        assert r["alert_events"] == ("Hurricane Warning (SIMULATED)",)
    finally:
        storm_replay_v2._load.cache_clear()

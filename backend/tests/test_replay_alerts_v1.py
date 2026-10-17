from backend.app.services.hazard import HAZARD_POLICY, assess
from backend.app.services.hazard_alerts_v1 import classify_alerts_v1
from backend.app.services.storm_replay_v2 import replay_site_v2, scenario_file

CALM = {"rain_forecast": 0.0, "gust_forecast": 10.0, "apparent_temp": 25.0}


def test_surf_and_rip_current_do_not_raise_caution():
    for ev in ("High Surf Advisory", "Rip Current Statement"):
        assert classify_alerts_v1([ev], HAZARD_POLICY) == ("NONE", [ev])


def test_other_advisories_still_raise_caution():
    assert classify_alerts_v1(["Wind Advisory"], HAZARD_POLICY)[0] == "CAUTION"


def test_hurricane_warning_forces_stop_work():
    assert classify_alerts_v1(["High Surf Advisory", "Hurricane Warning"], HAZARD_POLICY) == ("STOP_WORK", ["Hurricane Warning"])


def test_surf_advisory_stays_visible_but_site_is_normal():
    a = assess(CALM, ["High Surf Advisory"])
    assert a.weather_state == "NORMAL"
    assert a.alert_events == ("High Surf Advisory",)


def test_failed_alert_check_is_unknown():
    assert assess(CALM, None).weather_state == "UNKNOWN"


def test_scenario_file_mapping():
    assert scenario_file("calm-day") == "replay_calm.json"
    assert scenario_file(None) == "storm_replay.json"
    assert scenario_file("anything-else") == "storm_replay.json"


def test_replay_site_unknown_returns_none():
    assert replay_site_v2("NO-SUCH-SITE", "demo-storm") is None


def test_milton_replay_site_is_stop_work_from_archived_alerts():
    r = replay_site_v2("SITE-001", "demo-storm")
    assert r["weather_state"] == "STOP_WORK"
    assert "Hurricane Warning" in r["alert_events"]

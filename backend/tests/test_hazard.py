from backend.app.services.hazard import assess

DRY = {"rain_7d": 5.0, "rain_forecast": 0.0, "gust_forecast": 40.0, "apparent_temp": 30.0, "usda_soil": 0.0, "usda_clay_pct": 10.0}


def test_dry_day_is_normal_and_scored():
    a = assess(DRY, [])
    assert a.weather_state == "NORMAL" and a.hazard_score is not None and a.hazard_score < 3.5
    assert a.access_call == {"pickup": "GO_FOR_REVIEW", "heavy_truck": "GO_FOR_REVIEW"}


def test_thunderstorm_alert_forces_stop_work_even_with_low_score():
    a = assess(DRY, ["Severe Thunderstorm Warning"])
    assert a.weather_state == "STOP_WORK" and a.hazard_score < 3.5


def test_stop_work_wins_even_when_forecast_data_is_missing():
    a = assess({}, ["Severe Thunderstorm Watch"])
    assert a.weather_state == "STOP_WORK" and a.hazard_score is None


def test_flood_warning_stops_work_but_flood_watch_is_caution():
    assert assess(DRY, ["Flash Flood Warning"]).weather_state == "STOP_WORK"
    assert assess(DRY, ["Flood Watch"]).weather_state == "CAUTION"


def test_failed_alert_check_is_unknown_not_normal():
    a = assess(DRY, None)
    assert a.weather_state == "UNKNOWN" and a.hazard_score is None


def test_missing_forecast_is_unknown_never_zero_risk():
    a = assess({**DRY, "gust_forecast": None}, [])
    assert a.weather_state == "UNKNOWN" and a.hazard_score is None


def test_missing_ground_inputs_make_access_unknown():
    for key in ("rain_7d", "usda_soil"):
        a = assess({**DRY, key: None}, [])
        assert a.access_call == {"pickup": "UNKNOWN", "heavy_truck": "UNKNOWN"}
        assert a.weather_state == "NORMAL"  # weather safety does not depend on ground inputs


def test_soil_changes_access_but_not_hazard_score():
    dry_soil = assess(DRY, [])
    wet_soil = assess({**DRY, "usda_soil": 4.0, "usda_clay_pct": 50.0, "rain_7d": 45.0}, [])
    assert dry_soil.hazard_score == wet_soil.hazard_score
    assert wet_soil.access_call["heavy_truck"] != dry_soil.access_call["heavy_truck"]


def test_heavy_truck_is_never_less_cautious_than_pickup():
    rank = {"GO_FOR_REVIEW": 0, "MATS_FOR_REVIEW": 1, "NO_GO_FOR_REVIEW": 2}
    for rain in (0, 10, 25, 45, 80):
        for soil in range(5):
            a = assess({**DRY, "rain_7d": rain, "usda_soil": float(soil)}, [])
            assert rank[a.access_call["heavy_truck"]] >= rank[a.access_call["pickup"]]

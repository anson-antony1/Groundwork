from backend.app.services.weather import parse_location


def payload(rain):
    return {
        "daily": {
            "time": [f"2026-10-{d:02d}" for d in range(9, 18)],
            "precipitation_sum": rain,
            "wind_gusts_10m_max": [20.0] * 9,
            "apparent_temperature_max": [30.0] * 9,
        },
        "daily_units": {"precipitation_sum": "mm", "wind_gusts_10m_max": "km/h", "apparent_temperature_max": "°C"},
    }


def test_parse_sums_past_week_and_reads_tomorrow():
    obs = {o["variable"]: o for o in parse_location(payload([1.0] * 7 + [0.0, 5.5]), "2026-10-16T22:00:00+00:00")}
    assert obs["rain_7d"]["value"] == 7.0 and obs["rain_7d"]["kind"] == "modeled"
    assert obs["rain_forecast"]["value"] == 5.5 and obs["rain_forecast"]["valid_at"] == "2026-10-17"


def test_missing_day_makes_rain_7d_missing_not_zero():
    obs = {o["variable"]: o for o in parse_location(payload([1.0, None] + [1.0] * 7), "2026-10-16T22:00:00+00:00")}
    assert obs["rain_7d"]["value"] is None and obs["rain_7d"]["quality"] == "missing"

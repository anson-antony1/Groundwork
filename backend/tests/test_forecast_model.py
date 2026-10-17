from datetime import date

from backend.app.services import forecast_model as fm

VALUES = {"rain_forecast": 30.0, "gust_forecast": 70.0, "apparent_temp": 38.0, "rain_7d": 60.0}
CALM = {"rain_forecast": 0.0, "gust_forecast": 15.0, "apparent_temp": 20.0, "rain_7d": 0.0}


def toy_model() -> dict:
    """Weights only on gusts and forecast rain, so the expected behavior is easy to reason about."""
    names = list(fm.features(VALUES, 28.0, -81.0, date(2025, 7, 1)))
    coef = [1.5 if n == "gust_forecast" else 0.8 if n == "log_rain_forecast" else 0.0 for n in names]
    return {"version": "toy", "features": names, "mean": [0.0] * len(names), "scale": [10.0] * len(names),
            "coef": coef, "intercept": -3.0,
            "evaluation": {"test_base_rate": 0.05, "models": {"logistic_regression": {"roc_auc": 0.8}}}}


def test_missing_input_gives_no_prediction():
    assert fm.features({**VALUES, "gust_forecast": None}, 28.0, -81.0, date(2025, 7, 1)) is None
    assert fm.predict({**VALUES, "rain_7d": None}, 28.0, -81.0, date(2025, 7, 1), toy_model()) is None


def test_stormier_inputs_raise_the_probability():
    m = toy_model()
    storm = fm.predict(VALUES, 28.0, -81.0, date(2025, 7, 1), m)
    calm = fm.predict(CALM, 28.0, -81.0, date(2025, 7, 1), m)
    assert 0 <= calm["probability"] < storm["probability"] <= 1
    assert storm["drivers"][0] == "forecast gusts raises the risk"
    assert storm["test_roc_auc"] == 0.8 and storm["base_rate"] == 0.05


def test_every_feature_has_a_display_group():
    assert set(fm.features(VALUES, 28.0, -81.0, date(2025, 1, 1))) == set(fm.GROUPS)


def test_shipped_model_matches_the_feature_definition():
    model = fm.load_model()
    if model is None:
        return  # not trained yet in this checkout
    assert model["features"] == list(fm.features(VALUES, 28.0, -81.0, date(2025, 7, 1)))
    assert len(model["coef"]) == len(model["mean"]) == len(model["scale"]) == len(model["features"])


def test_site_and_model_card_endpoints(client):
    site = client.get("/api/v1/sites/SITE-001").json()["data"]
    assert "forecast_model" in site
    tray = client.get("/api/v1/sites/DEMO-TRAY").json()["data"]
    assert tray["forecast_model"] is None  # the tray has no weather feed
    card = client.get("/api/v1/forecast-model")
    assert card.status_code in (200, 404)
    if card.status_code == 200:
        ev = card.json()["data"]["evaluation"]
        assert {"rule_score", "logistic_regression"} <= set(ev["models"])

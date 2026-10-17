import pytest

from backend.app.services.weather import DRAINAGE_RANK, parse_alerts, parse_soil


def test_parse_alerts_lists_event_names():
    payload = {"features": [{"properties": {"event": "Flood Watch"}}, {"properties": {"event": "Wind Advisory"}}]}
    assert parse_alerts(payload) == ["Flood Watch", "Wind Advisory"]
    assert parse_alerts({"features": []}) == []


def test_error_payload_is_not_read_as_no_alerts():
    with pytest.raises(KeyError):
        parse_alerts({"title": "Bad Request", "status": 400})


def test_parse_soil_reads_drainage_and_clay():
    assert parse_soil({"Table": [["Poorly drained", "45.5"]]}) == ("poorly drained", 45.5)
    assert parse_soil({"Table": [["Well drained", None]]}) == ("well drained", None)


def test_missing_or_unknown_soil_raises_not_neutral():
    with pytest.raises(Exception):
        parse_soil({"Table": []})
    with pytest.raises(ValueError):
        parse_soil({"Table": [[None, "10"]]})
    with pytest.raises(ValueError):
        parse_soil({"Table": [["Swampy", "10"]]})


def test_drainage_rank_is_monotonic():
    order = ["well drained", "moderately well drained", "somewhat poorly drained", "poorly drained", "very poorly drained"]
    ranks = [DRAINAGE_RANK[o] for o in order]
    assert ranks == sorted(ranks) and ranks[0] == 0 and ranks[-1] == 4

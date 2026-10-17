"""Contract rules: uniform errors, strict inputs, no internal fields, pagination, stable OpenAPI."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.core.errors import register_exception_handlers
from backend.app.core.middleware import RateLimitMiddleware, RequestContextMiddleware
from backend.scripts.export_openapi import render

from .conftest import AUTH, TRAY

OPENAPI_FILE = Path(__file__).resolve().parents[1] / "openapi.json"


def assert_error(resp, status: int, code: str):
    assert resp.status_code == status
    body = resp.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details", "request_id"}
    assert body["error"]["code"] == code
    assert body["error"]["request_id"] == resp.headers["x-request-id"]
    return body["error"]


def test_missing_token_is_401(client):
    assert_error(client.post("/api/v1/sensors/readings", json={}), 401, "UNAUTHORIZED")


def test_unknown_site_is_404(client):
    err = assert_error(client.get("/api/v1/sites/NOPE"), 404, "NOT_FOUND")
    assert err["details"] == [{"field": "site_id", "issue": "unknown site"}]


def test_unknown_device_is_404(client):
    assert_error(client.get("/api/v1/devices/ghost/display"), 404, "NOT_FOUND")


def test_unknown_route_uses_error_shape(client):
    assert_error(client.get("/api/v1/nope"), 404, "NOT_FOUND")


def test_wrong_method_is_405(client):
    assert_error(client.patch("/api/v1/replay"), 405, "METHOD_NOT_ALLOWED")


def test_out_of_range_value_is_422_with_field(client, post_reading):
    err = assert_error(post_reading(150), 422, "VALIDATION_FAILED")
    assert err["details"][0]["field"] == "moisture_index"


def test_unknown_field_is_rejected(client, post_reading):
    err = assert_error(post_reading(50, surprise="x"), 422, "VALIDATION_FAILED")
    assert err["details"][0]["field"] == "surprise"


def test_malformed_json_is_400(client):
    resp = client.post("/api/v1/sensors/readings", headers={**AUTH, "Content-Type": "application/json"}, content=b"{bad")
    assert_error(resp, 400, "MALFORMED_JSON")


def test_bad_pagination_is_422(client):
    assert_error(client.get("/api/v1/sites?limit=0"), 422, "VALIDATION_FAILED")


def test_non_image_upload_is_415(client):
    resp = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "mud"},
                       files={"photo": ("x.jpg", b"not an image", "image/jpeg")})
    assert_error(resp, 415, "UNSUPPORTED_MEDIA_TYPE")


def test_blank_description_is_422(client):
    resp = client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "   "})
    assert_error(resp, 422, "VALIDATION_FAILED")


def test_internal_fields_do_not_leak(client, post_reading):
    reading = post_reading(50).json()["data"]
    assert "row_id" not in reading
    client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "mud"},
                files={"photo": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")})
    report = client.get("/api/v1/reports").json()["data"][0]
    assert "image_filename" not in report and report["image_url"].startswith("/uploads/")


def test_lists_are_paginated(client, post_reading):
    for _ in range(3):
        post_reading(50)
    body = client.get("/api/v1/sensors/tray-01/history?limit=2&offset=1").json()
    assert body["pagination"] == {"limit": 2, "offset": 1, "total": 3}
    assert len(body["data"]) == 2


def test_request_id_is_echoed(client):
    resp = client.get("/api/v1/health", headers={"X-Request-ID": "abc-123"})
    assert resp.headers["x-request-id"] == "abc-123"


def test_unhandled_exception_is_500_without_traceback():
    app = FastAPI()
    register_exception_handlers(app)
    app.add_middleware(RequestContextMiddleware)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret internals")

    resp = TestClient(app, raise_server_exceptions=False).get("/boom")
    err = resp.json()["error"]
    assert resp.status_code == 500 and err["code"] == "INTERNAL_ERROR"
    assert "secret" not in resp.text


def test_rate_limit_returns_429():
    app = FastAPI()
    register_exception_handlers(app)
    app.add_middleware(RateLimitMiddleware, limit_per_minute=2)

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    c = TestClient(app)
    assert [c.get("/api/ping").status_code for _ in range(3)] == [200, 200, 429]
    assert c.get("/api/ping").json()["error"]["code"] == "RATE_LIMITED"


def test_openapi_contract_is_committed():
    """If this fails after an intentional API change, run: python -m backend.scripts.export_openapi"""
    assert OPENAPI_FILE.exists(), "backend/openapi.json missing"
    assert OPENAPI_FILE.read_text(encoding="utf-8") == render()

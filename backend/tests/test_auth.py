"""Auth0 JWT checks, using real RS256 tokens signed by a throwaway key (no network, no Auth0 tenant)."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.app import config
from backend.app.core import auth

from .conftest import AUTH, TRAY

DOMAIN = "groundwork-test.us.auth0.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
READING = {"device_id": "tray-01", "site_id": "DEMO-TRAY", "moisture_index": 40,
           "recorded_at": "2026-10-16T21:00:00-04:00", "mode": "sensor_demo"}


def token(sub="auth0|crew-1", roles=(), key=KEY, aud=None, iss=None, exp_in=3600, **extra) -> str:
    claims = {"sub": sub, "aud": aud or config.AUTH0_AUDIENCE, "iss": iss or f"https://{DOMAIN}/",
              "iat": int(time.time()), "exp": int(time.time()) + exp_in, config.AUTH0_ROLES_CLAIM: list(roles), **extra}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test"})


def bearer(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


CREW = bearer(token("auth0|crew-1", ["crew"]))
SUPERVISOR = bearer(token("auth0|sup-1", ["supervisor"]))
MACHINE = bearer(token("bridge@clients", gty="client-credentials"))


@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "AUTH0_DOMAIN", DOMAIN)
    monkeypatch.setattr(config, "ALLOW_STATIC_SENSOR_TOKEN", True)
    monkeypatch.setattr(auth, "_signing_key", lambda _t: KEY.public_key())


def report(client, headers=None):
    return client.post("/api/v1/reports", data={"site_id": "DEMO-TRAY", "description": "Mud at gate"},
                       headers=headers or {})


# --- auth disabled (default): demo mode keeps working ---------------------------------------------

def test_disabled_mode_uses_labeled_demo_user(client):
    r = report(client).json()["data"]
    assert r["reported_by"] == "demo-user (auth disabled)"
    reviewed = client.post(f"/api/v1/reports/{r['id']}/review", json={"verification": "confirmed"}).json()["data"]
    assert reviewed["verified_by"] == "demo-user (auth disabled)"
    assert client.get("/api/v1/health").json()["data"]["auth"] == "disabled"


# --- user roles ----------------------------------------------------------------------------------

def test_no_token_is_401(client, auth_on):
    resp = report(client)
    assert resp.status_code == 401 and resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_crew_can_report_and_is_recorded(client, auth_on):
    r = report(client, CREW)
    assert r.status_code == 201 and r.json()["data"]["reported_by"] == "auth0|crew-1"


def test_crew_cannot_verify_but_supervisor_can(client, auth_on):
    """The demo moment: crew gets 403, supervisor succeeds, and the sign-off is audited."""
    rid = report(client, CREW).json()["data"]["id"]
    denied = client.post(f"/api/v1/reports/{rid}/review", json={"verification": "confirmed"}, headers=CREW)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "FORBIDDEN"
    assert "supervisor" in denied.json()["error"]["message"]
    ok = client.post(f"/api/v1/reports/{rid}/review", json={"verification": "confirmed"}, headers=SUPERVISOR)
    assert ok.status_code == 200 and ok.json()["data"]["verified_by"] == "auth0|sup-1"


@pytest.mark.parametrize("method,path,body", [
    ("post", "/api/v1/briefings/generate", None),
    ("post", "/api/v1/sites/DEMO-TRAY/evaluate", {"route_length": 100}),
    ("delete", f"{TRAY}/crew-flag", None),
])
def test_supervisor_only_routes(client, auth_on, method, path, body):
    kwargs = {"json": body} if body else {}
    assert getattr(client, method)(path, headers=CREW, **kwargs).status_code == 403
    assert getattr(client, method)(path, headers=SUPERVISOR, **kwargs).status_code in (200, 201)


def test_user_without_roles_cannot_report(client, auth_on):
    assert report(client, bearer(token("auth0|nobody"))).status_code == 403


@pytest.mark.parametrize("bad", [
    token(roles=["supervisor"], key=OTHER_KEY),              # forged signature
    token(roles=["supervisor"], aud="https://other-api"),     # wrong audience
    token(roles=["supervisor"], iss="https://evil.example/"),  # wrong issuer
    token(roles=["supervisor"], exp_in=-60),                   # expired
])
def test_invalid_tokens_are_401(client, auth_on, bad):
    assert client.post("/api/v1/briefings/generate", headers=bearer(bad)).status_code == 401


def test_reads_stay_open(client, auth_on):
    assert client.get("/api/v1/sites").status_code == 200
    assert client.get("/api/v1/health").json()["data"]["auth"] == "auth0"


# --- machine-to-machine for the serial bridge ----------------------------------------------------

def test_m2m_token_can_post_readings(client, auth_on):
    assert client.post("/api/v1/sensors/readings", json=READING, headers=MACHINE).status_code == 201


def test_write_sensors_permission_also_works(client, auth_on):
    t = bearer(token("svc", permissions=["write:sensors"]))
    assert client.post("/api/v1/sensors/readings", json=READING, headers=t).status_code == 201


def test_user_token_cannot_post_readings(client, auth_on):
    assert client.post("/api/v1/sensors/readings", json=READING, headers=SUPERVISOR).status_code == 403


@pytest.mark.parametrize("headers,status", [
    (SUPERVISOR, 200),   # dashboard Reset button with the supervisor's login
    (MACHINE, 200),      # bridge M2M token
    (AUTH, 200),         # static sensor token (offline fallback)
    (CREW, 403),
    ({}, 401),
])
def test_demo_reset_accepts_sensor_or_supervisor(client, auth_on, headers, status):
    assert client.post("/api/v1/demo/reset", headers=headers).status_code == status


def test_demo_reset_with_auth_off_still_needs_sensor_token(client):
    assert client.post("/api/v1/demo/reset").status_code == 401
    assert client.post("/api/v1/demo/reset", headers=AUTH).status_code == 200


def test_static_token_fallback_can_be_turned_off(client, auth_on, monkeypatch):
    assert client.post("/api/v1/sensors/readings", json=READING, headers=AUTH).status_code == 201
    monkeypatch.setattr(config, "ALLOW_STATIC_SENSOR_TOKEN", False)
    assert client.post("/api/v1/sensors/readings", json=READING, headers=AUTH).status_code == 401

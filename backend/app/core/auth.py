"""Auth0 access-token checks (RS256 JWTs for the Groundwork API audience).

* Users log in through Auth0 Universal Login; a Post-Login Action puts their roles (crew, supervisor)
  in the access token under config.AUTH0_ROLES_CLAIM.
* The serial bridge uses a Machine-to-Machine token (gty=client-credentials) or the write:sensors permission.
* With GROUNDWORK_AUTH_ENABLED off, every caller is a labeled demo user holding both roles, and sensor
  routes accept the static sensor token as before.

Settings are read from `config` on every request, so tests and ops can flip them without a restart.
"""
import logging
import secrets
from dataclasses import dataclass

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .. import config
from .errors import ForbiddenError, UnauthorizedError

log = logging.getLogger("groundwork.auth")

_bearer = HTTPBearer(auto_error=False)
_jwks_client: jwt.PyJWKClient | None = None
_BEARER_HEADER = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class Principal:
    sub: str                 # Auth0 subject (opaque id), or a demo/sensor label
    roles: frozenset[str]
    kind: str                # "user" | "machine" | "demo" | "sensor_token"


DEMO_USER = Principal("demo-user (auth disabled)", frozenset({"crew", "supervisor"}), "demo")
STATIC_SENSOR = Principal("static-sensor-token", frozenset(), "sensor_token")


def _signing_key(token: str):
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(f"https://{config.AUTH0_DOMAIN}/.well-known/jwks.json", cache_keys=True)
    return _jwks_client.get_signing_key_from_jwt(token).key


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, _signing_key(token), algorithms=["RS256"],
            audience=config.AUTH0_AUDIENCE, issuer=f"https://{config.AUTH0_DOMAIN}/",
        )
    except jwt.PyJWTError as e:
        log.warning("access token rejected", extra={"reason": type(e).__name__})
        raise UnauthorizedError("Invalid or expired access token.", headers=_BEARER_HEADER) from e


def _principal(claims: dict) -> Principal:
    if claims.get("gty") == "client-credentials":
        return Principal(claims["sub"], frozenset(), "machine")
    return Principal(claims["sub"], frozenset(claims.get(config.AUTH0_ROLES_CLAIM) or []), "user")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal:
    if not config.AUTH_ENABLED:
        return DEMO_USER
    if creds is None:
        raise UnauthorizedError("Log in required.", headers=_BEARER_HEADER)
    return _principal(decode_token(creds.credentials))


def require_role(*allowed: str):
    """Dependency: the caller must hold at least one of `allowed` roles. 401 if not logged in, 403 if wrong role."""
    def dependency(user: Principal = Depends(current_user)) -> Principal:
        if not user.roles & set(allowed):
            log.warning("role check failed", extra={"sub": user.sub, "required": list(allowed)})
            raise ForbiddenError(f"Requires role: {', '.join(allowed)}.",
                                 [{"field": None, "issue": f"your roles: {', '.join(sorted(user.roles)) or 'none'}"}])
        return user
    return dependency


def require_sensor_or_role(*allowed: str):
    """Dependency: accepts a sensor credential (static token or M2M) OR, with Auth0 on, a logged-in user
    holding one of `allowed` roles. Lets a dashboard button use the supervisor's login instead of a secret."""
    def dependency(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal:
        try:
            return require_sensor(creds)
        except (UnauthorizedError, ForbiddenError):
            if not config.AUTH_ENABLED or creds is None:
                raise  # auth off: the sensor token is the only credential, exactly as before
        user = _principal(decode_token(creds.credentials))
        if user.roles & set(allowed):
            return user
        raise ForbiddenError(f"Requires a sensor credential or role: {', '.join(allowed)}.",
                             [{"field": None, "issue": f"your roles: {', '.join(sorted(user.roles)) or 'none'}"}])
    return dependency


def require_sensor(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal:
    """Sensor writes: an Auth0 machine token (or write:sensors permission), or the static token fallback."""
    if creds is None:
        raise UnauthorizedError("Missing sensor credentials.", headers=_BEARER_HEADER)
    token = creds.credentials
    static_ok = not config.AUTH_ENABLED or config.ALLOW_STATIC_SENSOR_TOKEN
    if static_ok and secrets.compare_digest(token, config.SENSOR_TOKEN):
        return STATIC_SENSOR
    if not config.AUTH_ENABLED:
        log.warning("sensor token rejected")
        raise UnauthorizedError("Missing or invalid sensor token.", headers=_BEARER_HEADER)
    claims = decode_token(token)
    permissions = set(claims.get("permissions") or []) | set((claims.get("scope") or "").split())
    if claims.get("gty") != "client-credentials" and config.SENSOR_PERMISSION not in permissions:
        raise ForbiddenError("Sensor writes need an Auth0 machine-to-machine token.",
                             [{"field": None, "issue": f"token lacks {config.SENSOR_PERMISSION}"}])
    return _principal(claims)

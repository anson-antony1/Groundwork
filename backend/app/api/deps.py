import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import SENSOR_TOKEN

_bearer = HTTPBearer(auto_error=False)


def require_sensor_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    """Lightweight shared-secret check for the serial bridge (README section 10, security minimum)."""
    if creds is None or not secrets.compare_digest(creds.credentials, SENSOR_TOKEN):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid sensor token")

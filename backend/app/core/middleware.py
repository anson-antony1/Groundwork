import logging
import re
import time
import uuid

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .errors import error_payload
from .logging import request_id_var

access_log = logging.getLogger("groundwork.access")

_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


class RequestContextMiddleware:
    """Assigns a request_id (or reuses a sane X-Request-ID), echoes it back, and writes one access log line."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _VALID_REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        request_id_var.set(request_id)

        status = 500
        start = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            client = scope.get("client")
            access_log.info(
                "request",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                    "client_ip": client[0] if client else None,
                },
            )


class RateLimitMiddleware:
    """Fixed one-minute window per client IP, applied to API routes only. In-memory: single process."""

    def __init__(self, app: ASGIApp, limit_per_minute: int, path_prefix: str = "/api/"):
        self.app = app
        self.limit = limit_per_minute
        self.path_prefix = path_prefix
        self._windows: dict[str, tuple[int, int]] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self.limit <= 0 or not scope["path"].startswith(self.path_prefix):
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        key = client[0] if client else "unknown"
        now = time.time()
        window = int(now // 60)

        start, count = self._windows.get(key, (window, 0))
        if start != window:
            start, count = window, 0
        count += 1
        self._windows[key] = (start, count)
        if len(self._windows) > 10_000:
            self._windows = {k: v for k, v in self._windows.items() if v[0] == window}

        if count > self.limit:
            response = JSONResponse(
                error_payload("RATE_LIMITED", f"Rate limit of {self.limit} requests per minute exceeded."),
                status_code=429,
                headers={"Retry-After": str(60 - int(now % 60))},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)

"""One error shape for the whole API:

    {"error": {"code": "NOT_FOUND", "message": "...", "details": [{"field": ..., "issue": ...}], "request_id": "..."}}

Services raise AppError subclasses; they never build HTTP responses themselves.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .logging import request_id_var

log = logging.getLogger("groundwork.errors")


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str, details: list[dict] | None = None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []
        self.headers = headers


class ValidationFailedError(AppError):
    status_code = 422
    code = "VALIDATION_FAILED"


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMediaTypeError(AppError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"


_HTTP_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    429: "RATE_LIMITED",
}


def error_payload(code: str, message: str, details: list[dict] | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "request_id": request_id_var.get(),
        }
    }


def _field(loc: tuple) -> str | None:
    parts = [str(p) for p in loc if p != "body"]
    return ".".join(parts) or None


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_payload(exc.code, exc.message, exc.details), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        if any(e.get("type") == "json_invalid" for e in errors):
            return JSONResponse(error_payload("MALFORMED_JSON", "Request body is not valid JSON."), status_code=400)
        details = [{"field": _field(e["loc"]), "issue": e["msg"]} for e in errors]
        return JSONResponse(
            error_payload("VALIDATION_FAILED", "Request validation failed.", details), status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else code
        return JSONResponse(error_payload(code, message), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Full traceback goes to the log only; clients never see internals.
        log.exception("unhandled error", extra={"method": request.method, "path": request.url.path})
        return JSONResponse(error_payload("INTERNAL_ERROR", "An unexpected error occurred."), status_code=500)

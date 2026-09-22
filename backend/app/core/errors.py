"""Error domain aplikasi dan pemetaannya ke respons HTTP.

Semua lapisan service melempar `AppError` (atau turunannya) dengan pesan
berbahasa Indonesia yang siap ditampilkan ke pengguna. Router tidak perlu
menerjemahkan apa pun — handler global di `main.py` yang mengubahnya jadi
JSON `{"detail": "..."}`.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestError
from storage3.exceptions import StorageApiError
from supabase_auth.errors import AuthApiError


class AppError(Exception):
    status_code = 400

    def __init__(self, message: str, *, extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.extra = extra or {}


class ValidationError(AppError):
    """Input tidak lolos aturan bisnis (bukan sekadar bentuk JSON)."""

    status_code = 422


class NotFoundError(AppError):
    status_code = 404


class UnauthorizedError(AppError):
    status_code = 401


class ForbiddenError(AppError):
    status_code = 403


class ConflictError(AppError):
    """Bentrok dengan data yang sudah ada (duplikat, referensi masih dipakai)."""

    status_code = 409


class UpstreamError(AppError):
    """Layanan pihak ketiga (TrackSolid, ORS) gagal — bukan salah pengguna."""

    status_code = 502


class GoneError(AppError):
    """Resource pernah ada tapi sudah tidak tersedia (mis. link pelacakan usai)."""

    status_code = 410


def _postgrest_status(err: PostgrestError) -> int:
    code = err.code or ""
    if code == "23505" or code == "23503":
        return 409
    if code == "42501" or code == "PGRST301":
        return 403
    if code.startswith("PGRST3"):
        return 401
    return 400


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        body: dict[str, Any] = {"detail": exc.message}
        body.update(exc.extra)
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(PostgrestError)
    async def _postgrest_error(_: Request, exc: PostgrestError) -> JSONResponse:
        return JSONResponse(
            status_code=_postgrest_status(exc),
            content={"detail": exc.message, "code": exc.code},
        )

    @app.exception_handler(AuthApiError)
    async def _auth_error(_: Request, exc: AuthApiError) -> JSONResponse:
        status = exc.status if isinstance(exc.status, int) and exc.status >= 400 else 401
        return JSONResponse(status_code=status, content={"detail": exc.message})

    @app.exception_handler(StorageApiError)
    async def _storage_error(_: Request, exc: StorageApiError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": exc.message})

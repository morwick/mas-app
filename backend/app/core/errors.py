"""Error domain aplikasi dan pemetaannya ke respons HTTP.

Semua lapisan service melempar `AppError` (atau turunannya) dengan pesan
berbahasa Indonesia yang siap ditampilkan ke pengguna. Router tidak perlu
menerjemahkan apa pun — handler global di `main.py` yang mengubahnya jadi
JSON `{"detail": "..."}`.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestError
from storage3.exceptions import StorageApiError
from supabase_auth.errors import AuthApiError

logger = logging.getLogger(__name__)


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
    if code == "P0002":  # no_data_found — data yang diubah tidak ada / sudah dihapus
        return 404
    if code == "28000":  # sesi login tidak ditemukan → aplikasi meminta login lagi
        return 401
    if code.startswith("PGRST3"):
        return 401
    return 400


# ── Pesan gagal untuk proses tulis ──────────────────────────────────────────
# Setiap tambah/ubah/hapus berjalan dalam transaksi database (satu permintaan
# Data API, atau `Transaksi` untuk proses beberapa langkah). Kalau gagal,
# transaksinya sudah di-ROLLBACK oleh database — di sini pesannya diberi
# awalan yang jelas supaya pengguna tahu datanya tidak tersimpan.

# Endpoint POST yang bukan menambah data, melainkan mengubah data yang ada.
_AKSI_UBAH = {
    "status", "validate", "return", "cancel", "accept", "deactivate", "pin",
    "resolve", "reset-password", "tolak", "read", "read-all", "password",
    "calibrate", "sync-mileage", "active", "pagu", "ganti-truk",
}  # fmt: skip
# Bukan penyimpanan data: login/sesi, pengecekan, dan cron.
_TANPA_AWALAN = ("/auth/", "/driver/login", "/driver/logout", "/cron/", "/check-conflicts")


def awalan_gagal(method: str, path: str) -> str | None:
    """'Gagal menambah/mengubah/menghapus data' sesuai jenis permintaan tulis."""
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    if any(bagian in path for bagian in _TANPA_AWALAN):
        return None
    if method == "DELETE":
        return "Gagal menghapus data"
    if method in ("PUT", "PATCH"):
        return "Gagal mengubah data"
    if path.rstrip("/").rsplit("/", 1)[-1] in _AKSI_UBAH:
        return "Gagal mengubah data"
    return "Gagal menambah data"


def pesan_gagal(method: str, path: str, alasan: str) -> str:
    awalan = awalan_gagal(method, path)
    alasan = (alasan or "").strip()
    # Pesan yang sudah menyebut gagal (mis. "Pengguna gagal ditambahkan karena
    # email sudah terdaftar") tidak perlu diberi awalan lagi.
    if not awalan or "gagal" in alasan.lower():
        return alasan
    if not alasan:
        return f"{awalan}. Tidak ada data yang tersimpan."
    return f"{awalan}. {alasan}"


# Pesan bawaan Postgres (bahasa Inggris & teknis) → pesan yang bisa dibaca
# pengguna. Pesan dari RAISE EXCEPTION kita sendiri sudah berbahasa Indonesia
# dan dibiarkan apa adanya.
_PESAN_POSTGRES = (
    ("null value in column", "Ada data wajib yang belum diisi."),
    ("duplicate key value", "Data yang sama sudah ada."),
    ("violates foreign key constraint", "Data terkait tidak ditemukan atau masih dipakai data lain."),
    ("violates check constraint", "Ada isian yang tidak sesuai aturan."),
    ("violates row-level security", "Anda tidak berhak menyimpan data ini."),
    ("permission denied", "Anda tidak berhak melakukan aksi ini."),
    ("invalid input syntax", "Format isian tidak valid."),
)


def _pesan_postgres(err: PostgrestError) -> str:
    pesan = err.message or ""
    rendah = pesan.lower()
    for pola, terjemahan in _PESAN_POSTGRES:
        if pola in rendah:
            return terjemahan
    return pesan


def install_exception_handlers(app: FastAPI) -> None:
    def _json(request: Request, status: int, alasan: str, extra: dict[str, Any] | None = None) -> JSONResponse:
        body: dict[str, Any] = {"detail": pesan_gagal(request.method, request.url.path, alasan)}
        body.update(extra or {})
        return JSONResponse(status_code=status, content=body)

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return _json(request, exc.status_code, exc.message, exc.extra)

    @app.exception_handler(PostgrestError)
    async def _postgrest_error(request: Request, exc: PostgrestError) -> JSONResponse:
        return _json(request, _postgrest_status(exc), _pesan_postgres(exc), {"code": exc.code})

    @app.exception_handler(AuthApiError)
    async def _auth_error(request: Request, exc: AuthApiError) -> JSONResponse:
        status = exc.status if isinstance(exc.status, int) and exc.status >= 400 else 401
        return _json(request, status, exc.message)

    @app.exception_handler(StorageApiError)
    async def _storage_error(request: Request, exc: StorageApiError) -> JSONResponse:
        return _json(request, 400, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        pertama = str(errors[0].get("msg", "Data tidak valid")) if errors else "Data tidak valid"
        pertama = pertama.removeprefix("Value error, ")
        return _json(request, 422, pertama, {"errors": jsonable_encoder(errors)})

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Error tak terduga: transaksi di database sudah dibatalkan; jangan
        # bocorkan detail teknis ke pengguna, cukup catat di log server.
        logger.exception("Error tak terduga pada %s %s", request.method, request.url.path)
        return _json(request, 500, "Terjadi kesalahan di server. Tidak ada data yang tersimpan.")

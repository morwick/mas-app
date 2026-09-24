"""Konteks per permintaan HTTP yang dibutuhkan lapisan database.

IP pengguna disimpan di sini oleh middleware (app/main.py) lalu diteruskan
ke Postgres sebagai header `x-client-ip` di setiap query (app/core/supabase.py),
supaya log sistem (migration 20260924000009) bisa mencatatnya.
"""

from __future__ import annotations

from contextvars import ContextVar

from fastapi import Request

CLIENT_IP_HEADER = "x-client-ip"

ip_klien: ContextVar[str | None] = ContextVar("ip_klien", default=None)
# Browser/perangkat pengguna — disimpan di sesi login.
ua_klien: ContextVar[str | None] = ContextVar("ua_klien", default=None)


def ip_dari_request(request: Request, trusted_proxy_count: int = 1) -> str | None:
    """IP asli pengguna (untuk sesi login & log sistem).

    Setiap proxy MENAMBAHKAN alamat yang ia lihat di ujung kanan
    `X-Forwarded-For`, sedangkan entri kiri bisa dikarang klien. Jadi IP
    pengguna = entri ke-N dari kanan, N = jumlah proxy tepercaya
    (`TRUSTED_PROXY_COUNT`). Tanpa header atau N = 0: alamat koneksi langsung.
    """
    langsung = request.client.host if request.client else None
    if trusted_proxy_count <= 0:
        return langsung
    entri = [e.strip() for e in request.headers.get("x-forwarded-for", "").split(",") if e.strip()]
    if entri:
        return entri[-min(trusted_proxy_count, len(entri))][:100]
    return langsung

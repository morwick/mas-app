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


def ip_dari_request(request: Request) -> str | None:
    """IP asli pengguna.

    Di belakang reverse proxy/load balancer, IP pengguna ada di header
    `X-Forwarded-For` (entri pertama) atau `X-Real-IP`; tanpa proxy, pakai
    alamat koneksi langsung.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded.strip():
        return forwarded.split(",")[0].strip()[:100]
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip[:100]
    return request.client.host if request.client else None

"""Sesi portal driver.

Driver bukan user Supabase. Identitasnya adalah token sesi yang diterbitkan
fungsi `driver_login` di database dan dicabut oleh `driver_logout` / reset PIN.
Frontend mengirimnya lewat header `X-Driver-Token`; kode di sini tidak pernah
memutuskan sah atau tidaknya — itu dijawab `driver_me()` yang membaca
`current_driver_id()` di Postgres, jadi sesi yang sudah dicabut langsung tertolak.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Request
from supabase import AsyncClient

from app.core.errors import UnauthorizedError
from app.core.pg import first
from app.core.supabase import SupabaseClientFactory, get_client_factory

DRIVER_TOKEN_REQUEST_HEADER = "x-driver-token"


@dataclass(frozen=True)
class DriverSession:
    driver_id: str
    nama: str
    no_hp: str
    token: str


def driver_token(request: Request) -> str | None:
    value = request.headers.get(DRIVER_TOKEN_REQUEST_HEADER, "").strip()
    return value or None


async def resolve_driver_session(client: AsyncClient, token: str) -> DriverSession | None:
    try:
        res = await client.rpc("driver_me").execute()
    except Exception:
        return None
    row = first(res.data)
    if not row or not row.get("id"):
        return None
    return DriverSession(
        driver_id=str(row["id"]),
        nama=str(row.get("nama") or ""),
        no_hp=str(row.get("no_hp") or ""),
        token=token,
    )


async def require_driver(
    request: Request,
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> DriverSession:
    token = driver_token(request)
    if not token:
        raise UnauthorizedError("Sesi habis. Silakan login lagi.")
    async with factory.for_driver(token) as client:
        session = await resolve_driver_session(client, token)
    if session is None:
        raise UnauthorizedError("Sesi habis. Silakan login lagi.")
    return session


async def driver_client(
    session: DriverSession = Depends(require_driver),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    async with factory.for_driver(session.token) as client:
        yield client

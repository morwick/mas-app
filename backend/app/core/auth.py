"""Autentikasi admin/operator (user Supabase Auth).

Frontend menyimpan JWT hasil login dan mengirimnya sebagai
`Authorization: Bearer <token>`. Setiap request:

1. Token diverifikasi ke Supabase Auth (`/auth/v1/user`) — hasilnya dicache
   sebentar per token supaya tidak ada dua round-trip tambahan di tiap request.
2. Baris `profiles` dibaca untuk nama, role, dan scope jenis unit.
3. Klien Supabase yang membawa token yang sama diberikan ke service, sehingga
   RLS tetap menjadi penjaga akses yang sebenarnya — bukan kode di sini.
"""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal

from cachetools import TTLCache
from fastapi import Depends, Request
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.pg import single
from app.core.supabase import SupabaseClientFactory, get_client_factory

UserRole = Literal["superadmin", "operator"]

# Identitas per token disimpan 60 detik. Pencabutan sesi tetap efektif segera di
# sisi data karena RLS memverifikasi JWT pada setiap query; yang tertunda paling
# lama semenit hanyalah metadata nama/role di header UI.
_IDENTITY_CACHE: TTLCache[str, CurrentUser] = TTLCache(maxsize=512, ttl=60)


class CurrentUser(BaseModel):
    id: str
    email: str
    nama: str
    initials: str
    role: UserRole
    # superadmin: None (akses semua). operator: daftar jenis_unit_id yang boleh
    # diakses; None/kosong berarti belum diberi scope oleh superadmin.
    allowed_jenis_unit_ids: list[str] | None

    @property
    def is_superadmin(self) -> bool:
        return self.role == "superadmin"


@dataclass(frozen=True)
class AuthContext:
    user: CurrentUser
    token: str


def _initials(nama: str) -> str:
    parts = [p for p in nama.split(" ") if p][:2]
    return "".join(p[0] for p in parts).upper() or "A"


def build_current_user(*, user_id: str, email: str | None, profile: dict[str, object] | None) -> CurrentUser:
    """Susun identitas dari row auth + row profiles (boleh None bila belum ada)."""
    profile = profile or {}
    nama = str(profile.get("nama") or (email or "").split("@")[0] or "Admin")
    # Fail-safe: hanya nilai 'superadmin' yang memberi hak penuh. Sebelumnya
    # apa pun selain 'operator' dianggap owner — dengan itu baris yang belum
    # ikut migrasi (masih 'owner') akan lolos di backend padahal RLS sudah
    # menolaknya, menghasilkan kondisi setengah jalan yang membingungkan.
    role: UserRole = "superadmin" if profile.get("role") == "superadmin" else "operator"
    scope = profile.get("allowed_jenis_unit_ids")
    allowed = None if role == "superadmin" else (list(scope) if isinstance(scope, list) else None)
    return CurrentUser(
        id=user_id,
        email=str(profile.get("email") or email or ""),
        nama=nama,
        initials=_initials(nama),
        role=role,
        allowed_jenis_unit_ids=allowed,
    )


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


async def load_current_user(client: AsyncClient, token: str) -> CurrentUser:
    key = hashlib.sha256(token.encode()).hexdigest()
    cached = _IDENTITY_CACHE.get(key)
    if cached is not None:
        return cached

    try:
        res = await client.auth.get_user(token)
    except Exception as exc:  # AuthApiError, network, token rusak
        raise UnauthorizedError("Sesi tidak valid. Silakan login lagi.") from exc
    if res is None or res.user is None:
        raise UnauthorizedError("Sesi tidak valid. Silakan login lagi.")

    profile = (
        await client.table("profiles")
        .select("nama, email, role, allowed_jenis_unit_ids")
        .eq("id", res.user.id)
        .maybe_single()
        .execute()
    )
    user = build_current_user(
        user_id=res.user.id,
        email=res.user.email,
        profile=single(profile),
    )
    _IDENTITY_CACHE[key] = user
    return user


def forget_cached_identity(token: str) -> None:
    _IDENTITY_CACHE.pop(hashlib.sha256(token.encode()).hexdigest(), None)


async def require_auth(
    request: Request,
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AuthContext:
    token = bearer_token(request)
    if not token:
        raise UnauthorizedError("Butuh login.")
    async with factory.for_user(token) as client:
        user = await load_current_user(client, token)
    return AuthContext(user=user, token=token)


async def require_superadmin(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    if not auth.user.is_superadmin:
        raise ForbiddenError("Hanya super administrator yang boleh mengakses ini.")
    return auth


async def user_client(
    auth: AuthContext = Depends(require_auth),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    """Klien Supabase yang tunduk RLS sebagai user yang sedang login."""
    async with factory.for_user(auth.token) as client:
        yield client


async def superadmin_client(
    auth: AuthContext = Depends(require_superadmin),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    async with factory.for_user(auth.token) as client:
        yield client

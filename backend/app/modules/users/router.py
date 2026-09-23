"""Pengelolaan pengguna (super administrator saja): role, scope jenis unit, aktif/nonaktif."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import AuthContext, superadmin_client, require_superadmin
from app.core.errors import ValidationError
from app.core.pg import rows
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/users", tags=["users"])


class UserRow(BaseModel):
    id: str
    email: str
    nama: str
    role: Literal["superadmin", "operator"]
    is_active: bool
    allowed_jenis_unit_ids: list[str] | None
    created_at: str


class UpdateRoleRequest(BaseModel):
    role: Literal["superadmin", "operator"]
    # Hanya dipakai kalau role = operator; untuk superadmin kolom di-set null.
    allowed_jenis_unit_ids: list[str] = Field(default_factory=list)


class SetActiveRequest(BaseModel):
    is_active: bool


@router.get("", response_model=list[UserRow])
async def list_users(client: AsyncClient = Depends(superadmin_client)) -> list[UserRow]:
    res = await (
        client.table("profiles")
        .select("id, email, nama, role, is_active, allowed_jenis_unit_ids, created_at")
        .order("created_at")
        .execute()
    )
    return [
        UserRow(
            id=r["id"],
            email=r["email"],
            nama=r["nama"],
            role="superadmin" if r.get("role") == "superadmin" else "operator",
            is_active=bool(r["is_active"]),
            allowed_jenis_unit_ids=r.get("allowed_jenis_unit_ids"),
            created_at=r["created_at"],
        )
        for r in rows(res)
    ]


@router.patch("/{user_id}/role", response_model=OkResponse)
async def update_role(
    user_id: str,
    payload: UpdateRoleRequest,
    auth: AuthContext = Depends(require_superadmin),
    client: AsyncClient = Depends(superadmin_client),
) -> OkResponse:
    if auth.user.id == user_id:
        raise ValidationError("Anda tidak bisa mengubah role akun sendiri")
    data = (
        {"role": "superadmin", "allowed_jenis_unit_ids": None}
        if payload.role == "superadmin"
        else {
            "role": "operator",
            "allowed_jenis_unit_ids": sorted(set(payload.allowed_jenis_unit_ids)),
        }
    )
    await client.table("profiles").update(data).eq("id", user_id).execute()
    return OkResponse()


@router.patch("/{user_id}/active", response_model=OkResponse)
async def set_active(
    user_id: str,
    payload: SetActiveRequest,
    auth: AuthContext = Depends(require_superadmin),
    client: AsyncClient = Depends(superadmin_client),
) -> OkResponse:
    if auth.user.id == user_id:
        raise ValidationError("Anda tidak bisa menonaktifkan akun sendiri")
    await client.table("profiles").update({"is_active": payload.is_active}).eq("id", user_id).execute()
    return OkResponse()

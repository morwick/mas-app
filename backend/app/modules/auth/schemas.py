from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.core.auth import CurrentUser


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class GantiRoleRequest(BaseModel):
    role: Literal["superadmin", "operator"]


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int | None
    user: CurrentUser


class PasswordResetRequest(BaseModel):
    email: EmailStr


class UpdateProfileRequest(BaseModel):
    nama: str = Field(min_length=1, max_length=120)


class UpdatePasswordRequest(BaseModel):
    new_password: str
    confirm_password: str


class OkResponse(BaseModel):
    ok: bool = True

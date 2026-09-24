from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from app.core.auth import AuthContext, CurrentUser, require_auth, user_client
from app.core.config import Settings, get_settings
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.modules.auth.schemas import (
    GantiRoleRequest,
    LoginRequest,
    OkResponse,
    PasswordResetRequest,
    RefreshRequest,
    SessionResponse,
    UpdatePasswordRequest,
    UpdateProfileRequest,
)
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def get_service(
    factory: SupabaseClientFactory = Depends(get_client_factory),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(factory, settings)


@router.post("/login", response_model=SessionResponse)
async def login(payload: LoginRequest, svc: AuthService = Depends(get_service)) -> SessionResponse:
    return await svc.login(payload)


@router.post("/refresh", response_model=SessionResponse)
async def refresh(payload: RefreshRequest, svc: AuthService = Depends(get_service)) -> SessionResponse:
    return await svc.refresh(payload.refresh_token)


@router.post("/logout", response_model=OkResponse)
async def logout(auth: AuthContext = Depends(require_auth), svc: AuthService = Depends(get_service)) -> OkResponse:
    await svc.logout(auth)
    return OkResponse()


@router.post("/password-reset", response_model=OkResponse)
async def password_reset(payload: PasswordResetRequest, svc: AuthService = Depends(get_service)) -> OkResponse:
    await svc.request_password_reset(payload.email)
    return OkResponse()


@router.get("/me", response_model=CurrentUser)
async def me(auth: AuthContext = Depends(require_auth)) -> CurrentUser:
    return auth.user


@router.post("/role", response_model=CurrentUser)
async def ganti_role(
    payload: GantiRoleRequest,
    auth: AuthContext = Depends(require_auth),
    svc: AuthService = Depends(get_service),
) -> CurrentUser:
    """Ganti role aktif (akun dengan beberapa role)."""
    return await svc.ganti_role(auth, payload.role)


@router.patch("/profile", response_model=OkResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    auth: AuthContext = Depends(require_auth),
    client: AsyncClient = Depends(user_client),
    svc: AuthService = Depends(get_service),
) -> OkResponse:
    await svc.update_profile(client, auth, payload.nama)
    return OkResponse()


@router.post("/password", response_model=OkResponse)
async def update_password(
    payload: UpdatePasswordRequest,
    auth: AuthContext = Depends(require_auth),
    svc: AuthService = Depends(get_service),
) -> OkResponse:
    await svc.update_password(auth, payload)
    return OkResponse()

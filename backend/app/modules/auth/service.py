"""Login admin, refresh sesi, reset password, profil."""

from __future__ import annotations

import httpx
from supabase import AsyncClient
from supabase_auth.errors import AuthApiError

from app.core.auth import (
    AuthContext,
    build_current_user,
    forget_cached_identity,
    load_current_user,
)
from app.core.config import Settings
from app.core.errors import UnauthorizedError, ValidationError
from app.core.pg import single
from app.core.supabase import SupabaseClientFactory
from app.modules.auth.schemas import (
    LoginRequest,
    SessionResponse,
    UpdatePasswordRequest,
)


def _friendly_login_error(message: str) -> str:
    msg = message.lower()
    if "invalid login credentials" in msg:
        return "Email atau password salah."
    if "email not confirmed" in msg:
        return (
            "Email belum terkonfirmasi. Buka Supabase Dashboard → Authentication → "
            "Users → centang 'Confirm email' di user Anda."
        )
    if "rate limit" in msg or "too many" in msg:
        return "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi."
    return f"Login gagal: {message}"


class AuthService:
    def __init__(self, factory: SupabaseClientFactory, settings: Settings) -> None:
        self._factory = factory
        self._settings = settings

    async def login(self, payload: LoginRequest) -> SessionResponse:
        async with self._factory.anonymous() as anon:
            try:
                res = await anon.auth.sign_in_with_password({"email": payload.email, "password": payload.password})
            except AuthApiError as exc:
                raise UnauthorizedError(_friendly_login_error(exc.message)) from exc

        if res.session is None or res.user is None:
            raise UnauthorizedError("Login gagal: sesi tidak diterbitkan.")

        session = res.session
        # Akun tanpa row profiles (atau nonaktif) tidak bisa membaca apa pun karena
        # RLS — lebih baik ditolak di sini dengan pesan yang jelas.
        async with self._factory.for_user(session.access_token) as client:
            profile = single(
                await client.table("profiles")
                .select("nama, email, role, is_active, allowed_jenis_unit_ids")
                .eq("id", res.user.id)
                .maybe_single()
                .execute()
            )
        if profile is None:
            raise UnauthorizedError(
                "Akun login OK tapi profile admin belum ada di database. Pastikan trigger "
                "handle_new_user sudah jalan (migration 02), atau buat row manual di tabel profiles."
            )
        if not profile.get("is_active", True):
            raise UnauthorizedError("Akun admin Anda dinonaktifkan. Hubungi super-admin.")

        return SessionResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_at=session.expires_at,
            user=build_current_user(user_id=res.user.id, email=res.user.email, profile=profile),
        )

    async def refresh(self, refresh_token: str) -> SessionResponse:
        async with self._factory.anonymous() as anon:
            try:
                res = await anon.auth.refresh_session(refresh_token)
            except AuthApiError as exc:
                raise UnauthorizedError("Sesi habis. Silakan login lagi.") from exc
        if res.session is None or res.user is None:
            raise UnauthorizedError("Sesi habis. Silakan login lagi.")

        async with self._factory.for_user(res.session.access_token) as client:
            user = await load_current_user(client, res.session.access_token)
        return SessionResponse(
            access_token=res.session.access_token,
            refresh_token=res.session.refresh_token,
            expires_at=res.session.expires_at,
            user=user,
        )

    async def logout(self, auth: AuthContext) -> None:
        # GoTrue: POST /auth/v1/logout dengan JWT user. Kegagalan di sini tidak
        # perlu menghalangi logout di sisi klien.
        await self._gotrue("POST", "logout", token=auth.token, ok_statuses=(204, 200, 401, 403))
        forget_cached_identity(auth.token)

    async def request_password_reset(self, email: str) -> None:
        redirect_to = f"{self._settings.app_url.rstrip('/')}/reset-password/confirm"
        async with self._factory.anonymous() as anon:
            await anon.auth.reset_password_for_email(email, {"redirect_to": redirect_to})

    async def update_profile(self, client: AsyncClient, auth: AuthContext, nama: str) -> None:
        nama = nama.strip()
        if not nama:
            raise ValidationError("Nama wajib diisi")
        await client.table("profiles").update({"nama": nama}).eq("id", auth.user.id).execute()
        forget_cached_identity(auth.token)

    async def update_password(self, auth: AuthContext, payload: UpdatePasswordRequest) -> None:
        if len(payload.new_password) < 6:
            raise ValidationError("Password minimal 6 karakter")
        if payload.new_password != payload.confirm_password:
            raise ValidationError("Konfirmasi password tidak cocok")
        await self._gotrue("PUT", "user", token=auth.token, json={"password": payload.new_password})

    async def _gotrue(
        self,
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
        ok_statuses: tuple[int, ...] = (200,),
    ) -> None:
        """Panggilan GoTrue yang butuh JWT user (update user, logout)."""
        url = f"{self._settings.supabase_url.rstrip('/')}/auth/v1/{path}"
        headers = {
            "apikey": self._settings.supabase_anon_key,
            "Authorization": f"Bearer {token}",
        }
        async with httpx.AsyncClient(timeout=15.0) as http:
            res = await http.request(method, url, headers=headers, json=json)
        if res.status_code not in ok_statuses:
            try:
                detail = res.json()
            except ValueError:
                detail = {}
            message = (
                detail.get("msg")
                or detail.get("message")
                or detail.get("error_description")
                or f"Supabase Auth HTTP {res.status_code}"
            )
            raise ValidationError(str(message))

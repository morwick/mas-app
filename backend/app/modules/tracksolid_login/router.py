"""Login TrackSolid dibantu manusia (captcha).

Captcha TrackSolid tidak diakali: staf yang sedang membuka halaman ber-data
TrackSolid (popup di Dashboard, Unit, Pantau, Service) melihat gambar captcha
di aplikasi, mengetik kodenya sendiri, lalu sesi hasil login disimpan di
transport.tracksolid_sesi dan dipakai bersama semua proses backend.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.core.errors import ValidationError
from app.integrations.tracksolid.client import TrackSolidClient, get_tracksolid
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/tracksolid", tags=["tracksolid"])


class SesiTrackSolid(BaseModel):
    perlu_captcha: bool


class CaptchaResponse(BaseModel):
    # data:image/jpeg;base64,… — langsung dipakai <img src>.
    gambar: str


class LoginCaptchaRequest(BaseModel):
    kode: str = Field(min_length=1, max_length=20)


@router.get("/sesi", response_model=SesiTrackSolid)
async def sesi(
    _auth: AuthContext = Depends(require_auth),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> SesiTrackSolid:
    """Cek ringan saat membuka halaman ber-data TrackSolid (Unit, Pantau):
    hanya membaca status sesi di database, TrackSolid tidak dihubungi."""
    return SesiTrackSolid(perlu_captcha=await tracksolid.perlu_captcha())


# Captcha & login: semua staf yang login — popup muncul untuk siapa pun yang
# sedang membuka halaman ber-data TrackSolid (hak dicek juga di fungsi DB).
@router.post("/captcha", response_model=CaptchaResponse)
async def ambil_captcha(
    client: AsyncClient = Depends(user_client),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> CaptchaResponse:
    gambar, cookies = await tracksolid.ambil_captcha()
    await client.rpc("tracksolid_simpan_captcha", {"p_cookies": cookies}).execute()
    return CaptchaResponse(gambar="data:image/jpeg;base64," + base64.b64encode(gambar).decode())


@router.post("/login", response_model=OkResponse)
async def login_captcha(
    payload: LoginCaptchaRequest,
    client: AsyncClient = Depends(user_client),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> OkResponse:
    res = await client.rpc("tracksolid_captcha_cookies", {}).execute()
    cookies = res.data if isinstance(res.data, str) else None
    if not cookies:
        raise ValidationError("Captcha sudah kedaluwarsa. Ambil captcha baru lalu coba lagi.")
    sesi = await tracksolid.login_dengan_captcha(payload.kode, cookies)
    await client.rpc(
        "tracksolid_simpan_login",
        {"p_token": sesi.token, "p_akun_id": sesi.user_id, "p_cookies": sesi.cookies},
    ).execute()
    return OkResponse()

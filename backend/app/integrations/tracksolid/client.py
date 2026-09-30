"""Klien TrackSolid — login, lokasi terkini, dan mileage harian.

Alur auth (hasil investigasi DevTools tracksolidpro.com):
  1. POST /v3/new/homepage/login  {account, password: MD5(plain), language, nodeId, validCode}
     → data.token (JWT); accountId ada di claim JWT.
  2. POST /v3/new/newMonitor/getMonitorInfo  header Authorization: <token>
     → data[modeleName="latestPosition"].monitorBaseVOS[] berisi "address" & "latlng".
  3. POST /v3/new/newTrackInfo/getPointList  → data.totalMileage untuk satu jendela waktu.

Sesi dicache di memori proses dan disimpan di transport.tracksolid_sesi
(dipakai bersama semua proses, tahan restart); login ulang otomatis bila
TrackSolid membalas kode auth-error (100/401). Ini endpoint internal, bukan
Open API resmi — bisa berubah sewaktu-waktu.

Captcha: bila login dibalas kode 20227, captcha TIDAK diakali. Sesi ditandai
"perlu captcha", login otomatis berhenti (supaya akun tidak terkunci), dan
superadmin mengetik sendiri kode captcha lewat aplikasi
(ambil_captcha → login_dengan_captcha).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import UpstreamError, ValidationError
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.core.timeutil import iso_utc

log = logging.getLogger(__name__)

BASE_URL = "https://www.tracksolidpro.com"
IMEI_RE = re.compile(r"^\d{14,17}$")
TIMEOUT_S = 15.0
# Balasan login TrackSolid saat captcha wajib diisi.
KODE_PERLU_CAPTCHA = 20227

# Header ala browser supaya request dari server tidak dianggap bot.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/resource/dev/index.html",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
}


@dataclass
class _Session:
    token: str
    user_id: str
    cookies: str


# Penanda di body galat — frontend memunculkan popup captcha bila menerimanya.
KODE_GALAT_CAPTCHA = "tracksolid_captcha"


class CaptchaDiperlukanError(UpstreamError):
    """Sesi TrackSolid tidak valid & login butuh captcha — isi lewat popup di aplikasi."""

    def __init__(self) -> None:
        super().__init__(
            "Sesi TrackSolid tidak valid dan login butuh captcha. Isi kode captcha untuk menampilkan data GPS.",
            extra={"kode": KODE_GALAT_CAPTCHA},
        )


class SesiStore:
    """Sesi TrackSolid di database (service role — tabelnya tertutup RLS)."""

    def __init__(self, factory: SupabaseClientFactory) -> None:
        self._factory = factory

    async def baca(self) -> dict[str, Any] | None:
        async with self._factory.admin() as db:
            res = await (
                db.table("tracksolid_sesi")
                .select("token, akun_id, cookies, perlu_captcha")
                .eq("id", 1)
                .eq("status", 1)
                .maybe_single()
                .execute()
            )
        return res.data if res and isinstance(res.data, dict) else None

    async def simpan_otomatis(self, session: _Session) -> None:
        async with self._factory.admin() as db:
            await (
                db.table("tracksolid_sesi")
                .update(
                    {
                        "token": session.token,
                        "akun_id": session.user_id,
                        "cookies": session.cookies,
                        "perlu_captcha": False,
                        "perlu_captcha_at": None,
                        "diperbarui_at": iso_utc(),
                        "diperbarui_oleh": None,
                    }
                )
                .eq("id", 1)
                .execute()
            )

    async def tandai_perlu_captcha(self) -> None:
        async with self._factory.admin() as db:
            await (
                db.table("tracksolid_sesi")
                .update({"perlu_captcha": True, "perlu_captcha_at": iso_utc()})
                .eq("id", 1)
                .eq("perlu_captcha", False)
                .execute()
            )


class VehicleLocation(BaseModel):
    lat: float | None
    lng: float | None
    address: str | None


class DailyMileage(BaseModel):
    km: float
    unit: str
    fetched_at: str


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()  # noqa: S324 — dituntut API TrackSolid


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:  # noqa: BLE001
        return None


def _is_auth_error(status: int, body: dict[str, Any]) -> bool:
    if status in (401, 403):
        return True
    if body.get("ok") is False:
        if body.get("code") in (100, 401):
            return True
        msg = body.get("msg")
        if isinstance(msg, str) and re.search(r"token|login", msg, re.I):
            return True
    return False


def validate_imei(imei: str) -> None:
    if not IMEI_RE.match(imei or ""):
        raise ValidationError("Format IMEI tidak valid")


class TrackSolidClient:
    """Satu instance per proses; sesi login dibagi antar request & proses (DB)."""

    def __init__(self, store: SesiStore | None = None) -> None:
        self._session: _Session | None = None
        self._login_lock = asyncio.Lock()
        self._store = store

    @staticmethod
    async def _kirim_login(valid_code: str = "", cookies: str = "") -> tuple[dict[str, Any], str]:
        """POST login; mengembalikan (body, cookie balasan digabung cookie kiriman)."""
        settings = get_settings()
        if not settings.tracksolid_account or not settings.tracksolid_password:
            raise UpstreamError("TRACKSOLID_ACCOUNT dan TRACKSOLID_PASSWORD harus diisi di env")
        headers = {**BROWSER_HEADERS, **({"Cookie": cookies} if cookies else {})}
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
            res = await http.post(
                f"{BASE_URL}/v3/new/homepage/login",
                headers=headers,
                json={
                    "account": settings.tracksolid_account,
                    "password": _md5(settings.tracksolid_password),
                    "language": "id",
                    "nodeId": "",
                    "validCode": valid_code,
                },
            )
        if res.status_code >= 400:
            raise UpstreamError(f"TrackSolid login HTTP {res.status_code}")
        try:
            body = res.json()
        except ValueError as exc:
            raise UpstreamError("Balasan login TrackSolid tidak valid") from exc
        gabung = dict(p.split("=", 1) for p in cookies.split("; ") if "=" in p)
        gabung.update(res.cookies.items())
        return body if isinstance(body, dict) else {}, "; ".join(f"{k}={v}" for k, v in gabung.items())

    @staticmethod
    def _sesi_dari(body: dict[str, Any], cookies: str) -> _Session:
        token = (body.get("data") or {}).get("token")
        if not body.get("ok") or not token:
            raise UpstreamError(f"TrackSolid login gagal: {body.get('msg', 'unknown')} (code {body.get('code')})")
        claims = _decode_jwt_payload(token) or {}
        user_id = claims.get("accountId")
        if not isinstance(user_id, str):
            raise UpstreamError("Token TrackSolid tidak mengandung accountId")
        return _Session(token=token, user_id=user_id, cookies=cookies)

    async def _login(self) -> _Session:
        """Login otomatis (tanpa captcha). Butuh captcha → tandai & berhenti."""
        body, cookies = await self._kirim_login()
        if body.get("code") == KODE_PERLU_CAPTCHA:
            if self._store:
                await self._store.tandai_perlu_captcha()
            raise CaptchaDiperlukanError()
        session = self._sesi_dari(body, cookies)
        if self._store:
            await self._store.simpan_otomatis(session)
        return session

    async def _sesi_tersimpan(self) -> tuple[_Session | None, bool]:
        """(sesi di DB, perlu_captcha). Tanpa store → (None, False)."""
        if not self._store:
            return None, False
        row = await self._store.baca()
        if not row:
            return None, False
        sesi = None
        if row.get("token") and row.get("akun_id"):
            sesi = _Session(token=row["token"], user_id=row["akun_id"], cookies=row.get("cookies") or "")
        return sesi, bool(row.get("perlu_captcha"))

    async def _get_session(self, force_refresh: bool = False) -> _Session:
        if not force_refresh and self._session is not None:
            return self._session
        async with self._login_lock:
            if not force_refresh and self._session is not None:
                return self._session
            ditolak = self._session.token if (force_refresh and self._session) else None
            tersimpan, perlu_captcha = await self._sesi_tersimpan()
            if perlu_captcha:
                # Jangan coba login lagi — superadmin harus mengisi captcha dulu.
                self._session = None
                raise CaptchaDiperlukanError()
            # Sesi di DB lebih baru (mis. hasil login captcha dari proses lain).
            if tersimpan and tersimpan.token != ditolak:
                self._session = tersimpan
                return tersimpan
            self._session = await self._login()
            return self._session

    # ── Login dibantu superadmin (captcha) ──────────────────────────────────

    @staticmethod
    async def ambil_captcha() -> tuple[bytes, str]:
        """Gambar captcha (JPEG) + cookie sesinya — kode diketik superadmin."""
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
            res = await http.post(f"{BASE_URL}/v3/new/homepage/getImageValidCode", headers=BROWSER_HEADERS, json={})
        if res.status_code >= 400 or not res.headers.get("content-type", "").startswith("image/"):
            raise UpstreamError(f"Gagal mengambil captcha TrackSolid (HTTP {res.status_code})")
        cookies = "; ".join(f"{k}={v}" for k, v in res.cookies.items())
        if not cookies:
            raise UpstreamError("Captcha TrackSolid tidak membawa cookie sesi")
        return res.content, cookies

    async def login_dengan_captcha(self, kode: str, captcha_cookies: str) -> _Session:
        """Login memakai kode captcha yang diketik superadmin. Kode salah →
        ValidationError (ambil captcha baru)."""
        kode = (kode or "").strip()
        if not kode:
            raise ValidationError("Kode captcha wajib diisi")
        body, cookies = await self._kirim_login(kode, captcha_cookies)
        if body.get("code") == KODE_PERLU_CAPTCHA or (
            not body.get("ok") and re.search(r"code|captcha", str(body.get("msg")), re.I)
        ):
            raise ValidationError("Kode captcha salah atau sudah kedaluwarsa. Ambil captcha baru lalu coba lagi.")
        session = self._sesi_dari(body, cookies)
        async with self._login_lock:
            self._session = session
        return session

    async def _post(self, path: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        """POST dengan sesi aktif; login ulang sekali bila token ditolak."""
        session = await self._get_session()
        status, body = await self._post_with(session, path, payload)
        if _is_auth_error(status, body):
            session = await self._get_session(force_refresh=True)
            status, body = await self._post_with(session, path, payload)
        return status, body

    @staticmethod
    async def _post_with(session: _Session, path: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        headers = {**BROWSER_HEADERS, "Authorization": session.token}
        if session.cookies:
            headers["Cookie"] = session.cookies
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
            res = await http.post(f"{BASE_URL}{path}", headers=headers, json=payload)
        try:
            body = res.json()
        except ValueError:
            body = {}
        return res.status_code, body if isinstance(body, dict) else {}

    async def perlu_captcha(self) -> bool:
        """Status sesi dari database saja — TrackSolid tidak dihubungi."""
        _, perlu = await self._sesi_tersimpan()
        return perlu

    async def pastikan_sesi(self) -> None:
        """Gagal cepat (CaptchaDiperlukanError) sebelum memanggil banyak unit."""
        await self._get_session()

    async def get_vehicle_location(self, imei: str) -> VehicleLocation:
        validate_imei(imei)
        session = await self._get_session()
        _, body = await self._post(
            "/v3/new/newMonitor/getMonitorInfo",
            {"imei": imei, "userId": session.user_id, "isAllFlag": 1},
        )
        if not body.get("ok"):
            raise UpstreamError(
                f"TrackSolid getMonitorInfo gagal: {body.get('msg', 'unknown')} (code {body.get('code')})"
            )
        return _extract_location(body)

    async def get_daily_mileage(self, imei: str, start_time: str, end_time: str) -> DailyMileage:
        """Total km dalam jendela `start_time`–`end_time` ("YYYY-MM-DD HH:mm:ss", WIB).

        Mengembalikan 0 (bukan error) bila totalMileage kosong — unit yang
        seharian diam memang begitu.
        """
        validate_imei(imei)
        _, body = await self._post(
            "/v3/new/newTrackInfo/getPointList",
            {
                "startTime": start_time,
                "endTime": end_time,
                "imei": imei,
                "confidenceLevel": "",
                "selectMap": "googleMap",
                "selectType": "all",
            },
        )
        data = body.get("data")
        if not body.get("ok") or not isinstance(data, dict):
            raise UpstreamError(
                f"TrackSolid getPointList gagal: {body.get('msg', 'unknown')} (code {body.get('code')})"
            )
        raw = data.get("totalMileage")
        try:
            km = 0.0 if raw in (None, "") else float(raw)
        except (TypeError, ValueError) as exc:
            raise UpstreamError(f'totalMileage invalid: "{raw}"') from exc
        if km < 0:
            raise UpstreamError(f'totalMileage invalid: "{raw}"')
        return DailyMileage(km=km, unit=str(data.get("showUnit") or "km"), fetched_at=iso_utc())


def _extract_location(body: dict[str, Any]) -> VehicleLocation:
    blocks = body.get("data") or []
    position = next((b for b in blocks if b.get("modeleName") == "latestPosition"), None)
    fields = (position or {}).get("monitorBaseVOS") or []

    address_field = next((f for f in fields if f.get("key") == "address"), None)
    latlng_field = next((f for f in fields if f.get("key") == "latlng"), None)

    lat = lng = None
    if latlng_field and isinstance(latlng_field.get("value"), list):
        source = next((v for v in latlng_field["value"] if v.get("key") == "source_latlng"), None)
        if source and isinstance(source.get("value"), str):
            parts = source["value"].split(",")
            if len(parts) == 2:
                try:
                    lat, lng = float(parts[0]), float(parts[1])
                except ValueError:
                    lat = lng = None

    address = None
    if address_field and isinstance(address_field.get("value"), str):
        address = address_field["value"].strip() or None

    return VehicleLocation(lat=lat, lng=lng, address=address)


_client: TrackSolidClient | None = None


def get_tracksolid() -> TrackSolidClient:
    global _client
    if _client is None:
        # Sesi disimpan di DB bila service role tersedia (produksi); tanpa itu
        # (mis. tes / dev tanpa kunci) cukup di memori.
        store = SesiStore(get_client_factory()) if get_settings().supabase_service_role_key else None
        _client = TrackSolidClient(store)
    return _client

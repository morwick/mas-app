"""Pengelolaan pengguna (super administrator saja): tambah akun, role, scope
jenis unit, aktif/nonaktif, dan reset password.

Satu akun (satu email) boleh punya beberapa role (`roles`); role yang dipakai
dipilih per sesi login (migration 20260924000025). Satu karyawan + satu role
hanya boleh di satu akun."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError as PostgrestError
from pydantic import BaseModel, Field
from supabase import AsyncClient
from supabase_auth.errors import AuthApiError

from app.core.auth import AuthContext, forget_cached_identity, require_superadmin, superadmin_client
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.pg import rows, single
from app.core.request_context import ip_klien
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/users", tags=["users"])


Role = Literal["superadmin", "operator"]


class UserRow(BaseModel):
    id: str
    email: str
    nama: str
    # Role tertinggi (kompatibilitas tampilan lama).
    role: Role
    roles: list[Role]
    is_active: bool
    allowed_jenis_unit_ids: list[str] | None
    karyawan_id: str | None
    # Status karyawan pemilik akun (menu Karyawan). Nonaktif = akun tidak bisa diaktifkan.
    karyawan_aktif: bool = True
    created_at: str


class AkunKaryawan(BaseModel):
    user_id: str
    role: Literal["superadmin", "operator"]


class KaryawanOption(BaseModel):
    id: str
    nama: str
    tanggal_lahir: str | None
    # Role yang sudah dimiliki karyawan ini (satu baris per akun + role) —
    # karyawan + role yang sama tidak boleh ada di dua akun.
    akun: list[AkunKaryawan] = Field(default_factory=list)


class UpdateUserRequest(BaseModel):
    # Nama akun mengikuti karyawan yang dipilih (lihat create_user).
    karyawan_id: str = Field(min_length=1)
    email: str = Field(min_length=3, max_length=254)
    roles: list[Role] = Field(min_length=1)
    # Hanya dipakai kalau roles berisi operator; selain itu kolom di-set null.
    allowed_jenis_unit_ids: list[str] = Field(default_factory=list)


class SetActiveRequest(BaseModel):
    is_active: bool


# Samakan dengan batas minimal Supabase Auth (dan form ganti password profil).
_MIN_PASSWORD = 6


class CreateUserRequest(BaseModel):
    # Hanya karyawan yang boleh jadi pengguna; nama akun diambil dari karyawan.
    karyawan_id: str = Field(min_length=1)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=_MIN_PASSWORD, max_length=72)
    roles: list[Role] = Field(min_length=1)
    allowed_jenis_unit_ids: list[str] = Field(default_factory=list)


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=_MIN_PASSWORD, max_length=72)


_EMPTY_SCOPE_MESSAGE = "Data belum lengkap: operator wajib punya minimal satu scope jenis unit."

_DUPLICATE_ON_CREATE = "Pengguna gagal ditambahkan karena email sudah terdaftar."
_DUPLICATE_ON_UPDATE = "Perubahan gagal disimpan karena email sudah terdaftar."

_BUKAN_KARYAWAN = "Pengguna gagal ditambahkan: karyawan tidak ditemukan atau berstatus nonaktif."
_KARYAWAN_TIDAK_ADA = "Perubahan gagal disimpan: karyawan tidak ditemukan atau berstatus nonaktif."
_KARYAWAN_ROLE_TERDAFTAR = "Data sudah terdaftar: karyawan ini sudah punya akun lain dengan role tersebut."

_LABEL_ROLE = {"superadmin": "Super Administrator", "operator": "Operator"}

_PESAN_KARYAWAN_NONAKTIF = (
    "Pengguna gagal diaktifkan: karyawan {nama} berstatus Nonaktif. Aktifkan dulu karyawannya di menu Karyawan."
)

_LEPAS_SUPERADMIN_SENDIRI = (
    "Perubahan gagal disimpan: role Super Administrator tidak bisa dilepas dari akun sendiri — "
    "minta super administrator lain."
)


def _pesan_sudah_terdaftar(awal: str, nama: str, roles: list[str]) -> str:
    label = ", ".join(_LABEL_ROLE[r] for r in roles)
    return f"{awal} karena data sudah terdaftar: {nama} sudah punya akun lain dengan role {label}."


def _role_bentrok(karyawan: KaryawanOption, roles: list[str], kecuali_user: str | None = None) -> list[str]:
    """Role yang sudah dipakai akun LAIN milik karyawan yang sama."""
    return sorted({a.role for a in karyawan.akun if a.role in roles and a.user_id != kecuali_user})


def _roles_bersih(roles: list[str]) -> list[str]:
    return sorted(set(roles))


_PROFILE_COLUMNS = "id, email, nama, role, roles, is_active, allowed_jenis_unit_ids, karyawan_id, created_at"


def _to_row(r: dict, karyawan_aktif: bool = True) -> UserRow:
    return UserRow(
        id=r["id"],
        email=r["email"],
        nama=r["nama"],
        role="superadmin" if r.get("role") == "superadmin" else "operator",
        roles=[x for x in (r.get("roles") or [r.get("role") or "operator"]) if x in _LABEL_ROLE],
        is_active=bool(r["is_active"]),
        allowed_jenis_unit_ids=r.get("allowed_jenis_unit_ids"),
        karyawan_id=r.get("karyawan_id"),
        karyawan_aktif=karyawan_aktif,
        created_at=r["created_at"],
    )


def _clean_identity(nama: str, email: str) -> tuple[str, str]:
    nama = nama.strip()
    email = email.strip().lower()
    if not nama:
        raise ValidationError("Nama wajib diisi")
    if "@" not in email:
        raise ValidationError("Format email tidak valid")
    return nama, email


def _is_duplicate_email(exc: AuthApiError) -> bool:
    return getattr(exc, "code", None) == "email_exists" or "already" in (exc.message or "").lower()


async def _ensure_email_available(client: AsyncClient, email: str, message: str, exclude_id: str | None = None) -> None:
    """Tolak email yang sudah dipakai akun lain (tanpa peduli huruf besar/kecil).

    Dibandingkan di Python, bukan lewat filter `ilike`: `_` dan `%` lazim di
    email dan akan terbaca sebagai wildcard. Jumlah pengguna kecil, sama dengan
    yang sudah dimuat utuh oleh `list_users`. Supabase Auth tetap menolak email
    ganda sebagai lapis kedua (lihat `_is_duplicate_email`).
    """
    res = await client.table("profiles").select("id, email").execute()
    for r in rows(res):
        if r["id"] != exclude_id and str(r.get("email") or "").strip().lower() == email:
            raise ConflictError(message)


async def _update_profile(client: AsyncClient, user_id: str, data: dict[str, object]) -> None:
    try:
        await client.table("profiles").update(data).eq("id", user_id).execute()
    except PostgrestError as exc:
        # 23505 = unique violation dari index profiles_email_unique: dua
        # permintaan bersamaan sama-sama lolos `_ensure_email_available`.
        if exc.code == "23505":
            # Bisa dari dua constraint: email ganda atau karyawan yang sama
            # dipilih untuk dua akun sekaligus.
            if "karyawan" in (exc.message or "") + str(exc.details or ""):
                raise ConflictError(_KARYAWAN_ROLE_TERDAFTAR) from exc
            raise ConflictError(_DUPLICATE_ON_UPDATE) from exc
        raise


def _role_data(roles: list[str], allowed_jenis_unit_ids: list[str]) -> dict[str, object]:
    roles = _roles_bersih(roles)
    # Scope jenis unit hanya berarti untuk role operator.
    scope = sorted(set(allowed_jenis_unit_ids)) if "operator" in roles else None
    return {"roles": roles, "allowed_jenis_unit_ids": scope}


@router.get("", response_model=list[UserRow])
async def list_users(client: AsyncClient = Depends(superadmin_client)) -> list[UserRow]:
    res = await client.table("profiles").select(_PROFILE_COLUMNS).order("created_at").execute()
    status = await client.rpc("status_karyawan_pengguna").execute()
    aktif = {str(s["user_id"]): bool(s["karyawan_aktif"]) for s in rows(status)}
    return [_to_row(r, aktif.get(str(r["id"]), True)) for r in rows(res)]


async def _karyawan_pilihan(client: AsyncClient) -> list[KaryawanOption]:
    """Semua karyawan aktif beserta akun yang sudah dimilikinya."""
    res = await client.rpc("karyawan_untuk_pengguna").execute()
    return [
        KaryawanOption(
            id=str(r["id"]),
            nama=r["nama"],
            tanggal_lahir=r.get("tanggal_lahir"),
            akun=[AkunKaryawan(user_id=str(a["user_id"]), role=a["role"]) for a in (r.get("akun") or [])],
        )
        for r in rows(res)
    ]


@router.get("/karyawan-tersedia", response_model=list[KaryawanOption])
async def list_karyawan_tersedia(client: AsyncClient = Depends(superadmin_client)) -> list[KaryawanOption]:
    """Pilihan nama di form tambah & edit pengguna: SEMUA karyawan + akunnya."""
    return await _karyawan_pilihan(client)


@router.post("", response_model=UserRow, status_code=201)
async def create_user(
    payload: CreateUserRequest,
    auth: AuthContext = Depends(require_superadmin),
    client: AsyncClient = Depends(superadmin_client),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> UserRow:
    karyawan = next((k for k in await _karyawan_pilihan(client) if k.id == payload.karyawan_id), None)
    if karyawan is None:
        raise ValidationError(_BUKAN_KARYAWAN)
    roles = _roles_bersih(payload.roles)
    if bentrok := _role_bentrok(karyawan, roles):
        raise ConflictError(_pesan_sudah_terdaftar("Pengguna gagal ditambahkan", karyawan.nama, bentrok))
    nama, email = _clean_identity(karyawan.nama, payload.email)
    if "operator" in roles and not payload.allowed_jenis_unit_ids:
        raise ValidationError(_EMPTY_SCOPE_MESSAGE)
    await _ensure_email_available(client, email, _DUPLICATE_ON_CREATE)

    # Pembuatan akun Auth butuh service role; trigger handle_new_user lalu
    # membuat baris profiles dengan role titipan (dipercaya hanya bila pembuatnya
    # superadmin aktif) dan menolak akun tanpa karyawan_id valid. Email langsung dikonfirmasi karena password
    # sudah ditentukan superadmin.
    async with factory.admin() as admin:
        try:
            created = await admin.auth.admin.create_user(
                {
                    "email": email,
                    "password": payload.password,
                    "email_confirm": True,
                    # `dibuat_oleh` & `ip_pembuat`: akun dibuat server Supabase Auth
                    # lewat koneksinya sendiri (tanpa identitas & IP superadmin),
                    # jadi pelakunya dititipkan di sini untuk log sistem
                    # (divalidasi database, lihat migration 20260924000012 & 000030).
                    "user_metadata": {"nama": nama},
                    # app_metadata hanya bisa diisi service role (tidak lewat
                    # sign up), jadi database mempercayainya: karyawan, role,
                    # dan pembuat akun untuk log sistem (migration 000030).
                    "app_metadata": {
                        "karyawan_id": karyawan.id,
                        "roles": roles,
                        "dibuat_oleh": auth.user.id,
                        "ip_pembuat": ip_klien.get(),
                    },
                }
            )
        except AuthApiError as exc:
            if _is_duplicate_email(exc):
                raise ConflictError(_DUPLICATE_ON_CREATE) from exc
            raise
        user_id = created.user.id

        try:
            await (
                client.table("profiles")
                .update(_role_data(roles, payload.allowed_jenis_unit_ids))
                .eq("id", user_id)
                .execute()
            )
            res = await client.table("profiles").select(_PROFILE_COLUMNS).eq("id", user_id).maybe_single().execute()
            row = single(res)
            if row is None:
                raise ValidationError("Profil pengguna baru tidak terbentuk")
        except Exception:
            # Jangan tinggalkan akun Auth setengah jadi (role/scope belum terpasang).
            await admin.auth.admin.delete_user(user_id)
            raise
    return _to_row(row)


@router.post("/{user_id}/reset-password", response_model=OkResponse)
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    auth: AuthContext = Depends(require_superadmin),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> OkResponse:
    if auth.user.id == user_id:
        raise ValidationError("Ganti password akun sendiri lewat halaman Profil")
    async with factory.admin() as admin:
        await admin.auth.admin.update_user_by_id(user_id, {"password": payload.password})
    return OkResponse()


@router.patch("/{user_id}", response_model=OkResponse)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    auth: AuthContext = Depends(require_superadmin),
    client: AsyncClient = Depends(superadmin_client),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> OkResponse:
    akun_sendiri = auth.user.id == user_id
    if akun_sendiri and "superadmin" not in payload.roles:
        # Diedit dalam mode superadmin — melepasnya berarti langsung terkunci.
        raise ValidationError(_LEPAS_SUPERADMIN_SENDIRI)
    karyawan = next((k for k in await _karyawan_pilihan(client) if k.id == payload.karyawan_id), None)
    if karyawan is None:
        raise ValidationError(_KARYAWAN_TIDAK_ADA)
    roles = _roles_bersih(payload.roles)
    if bentrok := _role_bentrok(karyawan, roles, kecuali_user=user_id):
        raise ConflictError(_pesan_sudah_terdaftar("Perubahan gagal disimpan", karyawan.nama, bentrok))
    nama, email = _clean_identity(karyawan.nama, payload.email)
    if "operator" in roles and not payload.allowed_jenis_unit_ids:
        raise ValidationError(_EMPTY_SCOPE_MESSAGE)

    current = single(await client.table("profiles").select("email").eq("id", user_id).maybe_single().execute())
    if current is None:
        raise NotFoundError("Pengguna tidak ditemukan")
    old_email = str(current.get("email") or "")
    email_changed = old_email.strip().lower() != email

    data = {
        "nama": nama,
        "email": email,
        "karyawan_id": karyawan.id,
        **_role_data(roles, payload.allowed_jenis_unit_ids),
    }
    if not email_changed:
        await _update_profile(client, user_id, data)
        if akun_sendiri:
            forget_cached_identity(auth.token)
        return OkResponse()

    await _ensure_email_available(client, email, _DUPLICATE_ON_UPDATE, exclude_id=user_id)
    # Email login ada di Supabase Auth; profiles hanya salinannya. Auth diubah
    # dulu karena di sanalah keunikan email benar-benar dijaga.
    async with factory.admin() as admin:
        try:
            await admin.auth.admin.update_user_by_id(user_id, {"email": email, "email_confirm": True})
        except AuthApiError as exc:
            if _is_duplicate_email(exc):
                raise ConflictError(_DUPLICATE_ON_UPDATE) from exc
            raise
        try:
            await _update_profile(client, user_id, data)
        except Exception:
            # Kembalikan email login supaya Auth dan profiles tidak berbeda.
            await admin.auth.admin.update_user_by_id(user_id, {"email": old_email, "email_confirm": True})
            raise
    if akun_sendiri:
        forget_cached_identity(auth.token)
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
    if payload.is_active:
        # Pengguna hanya boleh aktif bila karyawannya berstatus Aktif
        # (dijaga juga di database, migration 20260924000027).
        profil = single(
            await client.table("profiles").select("nama, karyawan_id").eq("id", user_id).maybe_single().execute()
        )
        if profil is None:
            raise NotFoundError("Pengguna tidak ditemukan")
        cek = await client.rpc("karyawan_aktif", {"p_karyawan_id": profil.get("karyawan_id")}).execute()
        if cek.data is not True:
            raise ValidationError(_PESAN_KARYAWAN_NONAKTIF.format(nama=profil.get("nama") or "ini"))
    await client.table("profiles").update({"is_active": payload.is_active}).eq("id", user_id).execute()
    return OkResponse()

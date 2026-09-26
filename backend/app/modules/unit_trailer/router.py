"""Master Unit Trailer.

- Daftar: pagination di server (LIMIT/OFFSET lewat `.range()`), pencarian, dan
  filter status trailer & jenis. Hanya baris aktif (status = 1 — otomatis oleh
  DataClient).
- Tambah / ubah / hapus: superadmin & admin. Masing-masing satu permintaan =
  satu transaksi database; tercatat di log sistem oleh trigger.
- Status trailer sama dengan unit (migration 20260926000006) dan tidak diisi
  di form: Bertugas dari job, Breakdown / Perbaikan dari insiden, Terjual dari
  Penjualan Unit & Unit Trailer, Diafkirkan dari Penghapusan Unit & Unit Trailer.
- Hapus = soft delete: SQL-nya `UPDATE unit_trailer SET status = 2`.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from pydantic import BaseModel, Field, field_validator
from supabase import AsyncClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any, page_params
from app.core.pg import first, rows, single
from app.core.timeutil import today_wib
from app.modules.auth.schemas import OkResponse
from app.modules.incidents.schemas import Incident
from app.modules.incidents.service import IncidentService
from app.modules.jobs.schemas import Job
from app.modules.jobs.service import JobService
from app.modules.units.riwayat import hapus_aset, ringkasan_riwayat
from app.modules.units.schemas import RiwayatAset, UnitStatus, UnitStatusHistoryEntry

router = APIRouter(prefix="/unit-trailer", tags=["unit-trailer"])

_SELECT = (
    "id, kode_trailer, tahun, jenis_unit_trailer_id, kapasitas_ton, status_trailer, "
    "kir_nomor, kir_berlaku_sampai, srut_nomor, srut_tanggal, is_active, "
    "jenis:jenis_unit_trailer(nama, jenis_unit:jenis_unit(nama))"
)
_JENIS_SELECT = "id, nama, jenis_unit_id, jenis_unit:jenis_unit(nama)"
_DUPLIKAT = "Gagal! Unit Trailer dengan kode ini sudah ada"
_JENIS_DUPLIKAT = "Gagal! Jenis Unit Trailer dengan nama ini sudah ada"


class UnitTrailer(BaseModel):
    id: str
    kode_trailer: str
    tahun: int | None
    jenis_unit_trailer_id: str
    jenis_nama: str | None
    jenis_unit_nama: str | None
    kapasitas_ton: float | None
    status: UnitStatus
    # Dokumen (opsional): KIR & SRUT (Surat Registrasi Uji Tipe).
    kir_nomor: str | None = None
    kir_berlaku_sampai: str | None = None
    srut_nomor: str | None = None
    srut_tanggal: str | None = None
    # False = dinonaktifkan: tidak muncul di pilihan job, penjualan, penghapusan.
    is_active: bool = True


class JenisUnitTrailer(BaseModel):
    id: str
    nama: str
    jenis_unit_id: str
    jenis_unit_nama: str | None


class JenisUnitTrailerInput(BaseModel):
    nama: str = Field(min_length=1, max_length=80)
    # Wajib: setiap jenis unit trailer terhubung ke satu Jenis Unit (truk).
    jenis_unit_id: str = Field(min_length=1)


def _to_jenis(r: dict[str, Any]) -> JenisUnitTrailer:
    ju = first(r.get("jenis_unit"))
    return JenisUnitTrailer(
        id=r["id"], nama=r["nama"], jenis_unit_id=r["jenis_unit_id"], jenis_unit_nama=(ju or {}).get("nama")
    )


TAHUN_MIN = 1950
KAPASITAS_MAX = 999_999.99  # batas kolom NUMERIC(8, 2)


class UnitTrailerInput(BaseModel):
    kode_trailer: str = Field(min_length=1, max_length=40)
    tahun: int | None = None
    jenis_unit_trailer_id: str = Field(min_length=1)
    kapasitas_ton: float | None = None
    kir_nomor: str | None = Field(default=None, max_length=60)
    kir_berlaku_sampai: str | None = None
    srut_nomor: str | None = Field(default=None, max_length=60)
    srut_tanggal: str | None = None

    @field_validator("kir_nomor", "srut_nomor", mode="before")
    @classmethod
    def _teks_opsional(cls, v: object) -> object:
        if v is None:
            return None
        teks = " ".join(str(v).split())
        return teks or None

    @field_validator("kir_berlaku_sampai", "srut_tanggal", mode="before")
    @classmethod
    def _tanggal_opsional(cls, v: object) -> object:
        if v is None or str(v).strip() == "":
            return None
        teks = str(v).strip()[:10]
        try:
            date.fromisoformat(teks)
        except ValueError:
            raise ValueError("Tanggal tidak valid (format YYYY-MM-DD)") from None
        return teks

    # Isian yang tidak valid menggagalkan simpan (bukan dikosongkan diam-diam).
    @field_validator("tahun", mode="before")
    @classmethod
    def _tahun_valid(cls, v: object) -> object:
        if v is None or v == "":
            return None
        if isinstance(v, bool) or not isinstance(v, (int, str)) or not str(v).strip().isdigit():
            raise ValueError("Tahun tidak valid: harus angka 4 digit")
        tahun = int(str(v).strip())
        batas_atas = today_wib().year + 1
        if not TAHUN_MIN <= tahun <= batas_atas:
            raise ValueError(f"Tahun tidak valid: harus antara {TAHUN_MIN} dan {batas_atas}")
        return tahun

    @field_validator("kapasitas_ton", mode="before")
    @classmethod
    def _kapasitas_valid(cls, v: object) -> object:
        if v is None or v == "":
            return None
        try:
            if isinstance(v, bool):
                raise ValueError
            nilai = float(str(v).replace(",", "."))
        except ValueError:
            raise ValueError("Kapasitas muatan tidak valid: harus angka") from None
        if nilai != nilai or nilai <= 0 or nilai > KAPASITAS_MAX:  # nilai != nilai → NaN
            raise ValueError("Kapasitas muatan tidak valid: harus lebih dari 0 ton")
        if round(nilai, 2) != nilai:
            raise ValueError("Kapasitas muatan tidak valid: maksimal 2 angka di belakang koma")
        return nilai


def _to_trailer(r: dict[str, Any]) -> UnitTrailer:
    jenis = first(r.get("jenis"))
    jenis_unit = first((jenis or {}).get("jenis_unit"))
    kapasitas = r.get("kapasitas_ton")
    return UnitTrailer(
        id=r["id"],
        kode_trailer=r["kode_trailer"],
        tahun=r.get("tahun"),
        jenis_unit_trailer_id=r["jenis_unit_trailer_id"],
        jenis_nama=(jenis or {}).get("nama"),
        jenis_unit_nama=(jenis_unit or {}).get("nama"),
        kapasitas_ton=float(kapasitas) if kapasitas is not None else None,
        status=r["status_trailer"],
        kir_nomor=r.get("kir_nomor"),
        kir_berlaku_sampai=r.get("kir_berlaku_sampai"),
        srut_nomor=r.get("srut_nomor"),
        srut_tanggal=r.get("srut_tanggal"),
        is_active=bool(r.get("is_active", True)),
    )


def _data(payload: UnitTrailerInput) -> dict[str, Any]:
    kode = " ".join(payload.kode_trailer.split())
    if not kode:
        raise ValidationError("Kode trailer wajib diisi")
    return {
        "kode_trailer": kode,
        "tahun": payload.tahun,
        "jenis_unit_trailer_id": payload.jenis_unit_trailer_id,
        "kapasitas_ton": payload.kapasitas_ton,
        "kir_nomor": payload.kir_nomor,
        "kir_berlaku_sampai": payload.kir_berlaku_sampai,
        "srut_nomor": payload.srut_nomor,
        "srut_tanggal": payload.srut_tanggal,
    }


async def _pastikan_kode_unik(client: AsyncClient, kode: str, kecuali_id: str | None = None) -> None:
    # Dibandingkan di Python (tanpa ilike) supaya `_`/`%` tidak jadi wildcard.
    # Index unik database tetap menjadi penjaga terakhir.
    res = await client.table("unit_trailer").select("id, kode_trailer").execute()
    kunci = kode.strip().lower()
    for r in rows(res):
        if r["id"] != kecuali_id and str(r.get("kode_trailer") or "").strip().lower() == kunci:
            raise ConflictError(_DUPLIKAT)


def _duplikat_dari_db(exc: APIError) -> None:
    if exc.code == "23505":
        raise ConflictError(_DUPLIKAT) from exc


# ── Jenis Unit Trailer (master sendiri, beda dengan Jenis Unit truk) ─────────


def _kunci_nama(nama: str) -> str:
    return " ".join(nama.split()).casefold()


@router.get("/jenis", response_model=list[JenisUnitTrailer])
async def daftar_jenis_unit_trailer(client: AsyncClient = Depends(user_client)) -> list[JenisUnitTrailer]:
    res = await client.table("jenis_unit_trailer").select(_JENIS_SELECT).order("nama").execute()
    return [_to_jenis(r) for r in rows(res)]


@router.post("/jenis", response_model=JenisUnitTrailer, status_code=201)
async def tambah_jenis_unit_trailer(
    payload: JenisUnitTrailerInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> JenisUnitTrailer:
    nama = " ".join(payload.nama.split())
    if not nama:
        raise ValidationError("Nama jenis unit trailer wajib diisi")
    ada = await client.table("jenis_unit_trailer").select("nama").execute()
    if any(_kunci_nama(str(r.get("nama") or "")) == _kunci_nama(nama) for r in rows(ada)):
        raise ConflictError(_JENIS_DUPLIKAT)
    try:
        res = (
            await client.table("jenis_unit_trailer")
            .insert({"nama": nama, "jenis_unit_id": payload.jenis_unit_id})
            .execute()
        )
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError(_JENIS_DUPLIKAT) from exc
        if exc.code == "23503":
            raise ValidationError("Jenis unit tidak ditemukan") from exc
        raise
    baru = rows(res)[0]
    row = single(
        await client.table("jenis_unit_trailer").select(_JENIS_SELECT).eq("id", baru["id"]).maybe_single().execute()
    )
    return _to_jenis(row or baru)


# ── Pilihan unit trailer untuk form job ─────────────────────────────────────


class TrailerPilihan(BaseModel):
    id: str
    kode_trailer: str
    jenis_nama: str | None
    status: UnitStatus


class TrailerUntukUnit(BaseModel):
    # True bila jenis unit dari unit ini punya jenis unit trailer → trailer wajib diisi.
    wajib: bool
    trailer: list[TrailerPilihan]


@router.get("/untuk-unit/{unit_id}", response_model=TrailerUntukUnit)
async def trailer_untuk_unit(unit_id: str, client: AsyncClient = Depends(user_client)) -> TrailerUntukUnit:
    res = await client.rpc("unit_trailer_untuk_unit", {"p_unit_id": unit_id}).execute()
    data = rows(res)
    return TrailerUntukUnit(
        wajib=bool(data and data[0].get("wajib")),
        trailer=[
            TrailerPilihan(
                id=str(r["id"]),
                kode_trailer=r["kode_trailer"],
                jenis_nama=r.get("jenis_nama"),
                status=r["status_trailer"],
            )
            for r in data
            if r.get("id") and r.get("status_trailer") not in ("terjual", "diafkirkan")
        ],
    )


# ── Unit Trailer ────────────────────────────────────────────────────────────


@router.get("", response_model=Page[UnitTrailer])
async def daftar_unit_trailer(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100)] = None,
    status: UnitStatus | None = None,
    jenis_unit_trailer_id: str | None = None,
    client: AsyncClient = Depends(user_client),
) -> Page[UnitTrailer]:
    query = client.table("unit_trailer").select(_SELECT, count=CountMethod.exact)
    if q and q.strip():
        query = query.or_(ilike_any(["kode_trailer"], q))
    if status:
        query = query.eq("status_trailer", status)
    if jenis_unit_trailer_id:
        query = query.eq("jenis_unit_trailer_id", jenis_unit_trailer_id)
    res = await apply_window(query.order("kode_trailer").order("id"), params).execute()
    return build_page([_to_trailer(r) for r in rows(res)], res.count, params)


@router.post("", response_model=UnitTrailer, status_code=201)
async def tambah_unit_trailer(
    payload: UnitTrailerInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> UnitTrailer:
    data = _data(payload)
    await _pastikan_kode_unik(client, data["kode_trailer"])
    try:
        res = await client.table("unit_trailer").insert(data).execute()
    except APIError as exc:
        _duplikat_dari_db(exc)
        raise
    baru = rows(res)[0]
    row = single(await client.table("unit_trailer").select(_SELECT).eq("id", baru["id"]).maybe_single().execute())
    return _to_trailer(row or baru)


@router.patch("/{trailer_id}", response_model=OkResponse)
async def ubah_unit_trailer(
    trailer_id: str, payload: UnitTrailerInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    data = _data(payload)
    lama = single(
        await client.table("unit_trailer").select("status_trailer").eq("id", trailer_id).maybe_single().execute()
    )
    if lama and lama.get("status_trailer") == "terjual":
        raise ValidationError(
            "Unit trailer sudah terjual. Batalkan penjualannya dulu lewat menu Penjualan Unit & Unit Trailer."
        )
    await _pastikan_kode_unik(client, data["kode_trailer"], kecuali_id=trailer_id)
    try:
        res = await client.table("unit_trailer").update(data).eq("id", trailer_id).execute()
    except APIError as exc:
        _duplikat_dari_db(exc)
        raise
    if not rows(res):
        raise NotFoundError("Unit trailer tidak ditemukan atau sudah dihapus")
    return OkResponse()


@router.delete("/{trailer_id}", response_model=OkResponse)
async def hapus_unit_trailer(trailer_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    """Hapus unit trailer tanpa riwayat (soft delete berantai lewat fungsi DB);
    yang sudah punya riwayat ditolak — nonaktifkan saja."""
    await hapus_aset(client, "unit_trailer", trailer_id)
    return OkResponse()


@router.post("/{trailer_id}/nonaktifkan", response_model=OkResponse)
async def nonaktifkan_unit_trailer(
    trailer_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    res = await client.table("unit_trailer").update({"is_active": False}).eq("id", trailer_id).execute()
    if not rows(res):
        raise NotFoundError("Unit trailer tidak ditemukan atau sudah dihapus")
    return OkResponse()


# ── Detail unit trailer (setara detail unit) ────────────────────────────────


async def _ambil(client: AsyncClient, trailer_id: str) -> UnitTrailer:
    row = single(await client.table("unit_trailer").select(_SELECT).eq("id", trailer_id).maybe_single().execute())
    if row is None:
        raise NotFoundError("Unit trailer tidak ditemukan")
    return _to_trailer(row)


@router.get("/{trailer_id}", response_model=UnitTrailer)
async def detail_unit_trailer(trailer_id: str, client: AsyncClient = Depends(user_client)) -> UnitTrailer:
    return await _ambil(client, trailer_id)


@router.get("/{trailer_id}/riwayat", response_model=RiwayatAset)
async def riwayat_unit_trailer(trailer_id: str, client: AsyncClient = Depends(user_client)) -> RiwayatAset:
    """Jumlah riwayat — tombol Hapus hanya muncul bila semuanya kosong."""
    return await ringkasan_riwayat(client, "unit_trailer", trailer_id)


@router.get("/{trailer_id}/jobs", response_model=list[Job])
async def job_unit_trailer(trailer_id: str, client: AsyncClient = Depends(user_client)) -> list[Job]:
    return await JobService(client).list_by_unit_trailer(trailer_id)


@router.get("/{trailer_id}/incidents", response_model=list[Incident])
async def insiden_unit_trailer(trailer_id: str, client: AsyncClient = Depends(user_client)) -> list[Incident]:
    return await IncidentService(client).list_by_unit_trailer(trailer_id)


@router.get("/{trailer_id}/status-history", response_model=list[UnitStatusHistoryEntry])
async def riwayat_status_unit_trailer(
    trailer_id: str, client: AsyncClient = Depends(user_client)
) -> list[UnitStatusHistoryEntry]:
    res = await (
        client.table("unit_trailer_status_history")
        .select("*, profiles(nama)")
        .eq("unit_trailer_id", trailer_id)
        .order("changed_at", desc=True)
        .execute()
    )
    return [
        UnitStatusHistoryEntry(
            id=r["id"],
            unit_id=r["unit_trailer_id"],
            status_old=r.get("status_old"),
            status_new=r["status_new"],
            changed_by_nama=(first(r.get("profiles")) or {}).get("nama") or "Sistem",
            changed_at=r["changed_at"],
            reason=r.get("reason"),
        )
        for r in rows(res)
    ]

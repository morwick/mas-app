"""Data aset (unit / unit trailer) untuk form Penjualan & Penghapusan.

Dipakai bersama supaya kedua menu menilai "sedang bertugas" dan "insiden
terbuka" dengan cara yang sama.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.errors import NotFoundError
from app.core.pg import first, rows, single
from app.core.soft_delete import AKTIF

JenisAset = Literal["unit", "unit_trailer"]

_JOB_SELESAI = ("selesai", "cancelled")


# Embed PostgREST untuk tabel yang punya unit_id & unit_trailer_id (penjualan,
# penghapusan) — bahan isi surat & berita acara.
ASET_DOKUMEN_SELECT = """
  unit:units(kode_unit, no_polisi, tahun, stnk_nomor, kir_nomor, jenis_unit(nama)),
  unit_trailer:unit_trailer(kode_trailer, tahun, kapasitas_ton, kir_nomor, srut_nomor, jenis:jenis_unit_trailer(nama))
"""


class AsetDokumen(BaseModel):
    """Data aset yang dicetak di surat penjualan, BAST, dan berita acara penghapusan."""

    kode: str
    jenis_nama: str | None = None
    no_polisi: str | None = None
    tahun: int | None = None
    kapasitas_ton: float | None = None
    stnk_nomor: str | None = None
    kir_nomor: str | None = None
    srut_nomor: str | None = None


def aset_dokumen(r: dict[str, Any]) -> AsetDokumen:
    """Baris hasil ASET_DOKUMEN_SELECT → AsetDokumen."""
    if r.get("jenis_aset") == "unit":
        u = first(r.get("unit")) or {}
        return AsetDokumen(
            kode=u.get("kode_unit") or "—",
            jenis_nama=(first(u.get("jenis_unit")) or {}).get("nama"),
            no_polisi=u.get("no_polisi"),
            tahun=u.get("tahun"),
            stnk_nomor=u.get("stnk_nomor"),
            kir_nomor=u.get("kir_nomor"),
        )
    t = first(r.get("unit_trailer")) or {}
    kapasitas = t.get("kapasitas_ton")
    return AsetDokumen(
        kode=t.get("kode_trailer") or "—",
        jenis_nama=(first(t.get("jenis")) or {}).get("nama"),
        tahun=t.get("tahun"),
        kapasitas_ton=float(kapasitas) if kapasitas is not None else None,
        kir_nomor=t.get("kir_nomor"),
        srut_nomor=t.get("srut_nomor"),
    )


def label_aset(jenis_aset: JenisAset) -> str:
    return "unit" if jenis_aset == "unit" else "unit trailer"


def _kolom(jenis_aset: JenisAset) -> str:
    return "unit_id" if jenis_aset == "unit" else "unit_trailer_id"


async def job_aktif_per_aset(db: AsyncClient, jenis_aset: JenisAset) -> dict[str, str]:
    """{id aset: nomor job} untuk aset yang masih dipakai job yang belum selesai."""
    kolom = _kolom(jenis_aset)
    res = await (
        db.table("jobs")
        .select(f"job_number, {kolom}")
        .eq("status", AKTIF)
        .not_.in_("status_job", list(_JOB_SELESAI))
        .not_.is_(kolom, "null")
        .order("etd")
        .execute()
    )
    hasil: dict[str, str] = {}
    for r in rows(res):
        hasil.setdefault(r[kolom], r["job_number"])
    return hasil


async def insiden_terbuka_per_aset(db: AsyncClient, jenis_aset: JenisAset) -> dict[str, int]:
    """{id aset: jumlah insiden yang belum selesai}."""
    kolom = _kolom(jenis_aset)
    res = await (
        db.table("incident_logs")
        .select(kolom)
        .eq("status", AKTIF)
        .neq("status_penanganan", "resolved")
        .not_.is_(kolom, "null")
        .execute()
    )
    hasil: dict[str, int] = {}
    for r in rows(res):
        hasil[r[kolom]] = hasil.get(r[kolom], 0) + 1
    return hasil


async def daftar_aset(
    db: AsyncClient, jenis_aset: JenisAset, *, kecuali: tuple[str, ...]
) -> list[tuple[str, str, str, str | None]]:
    """[(id, kode, status, nama jenis)] aset yang statusnya bukan `kecuali`."""
    if jenis_aset == "unit":
        res = (
            await db.table("units")
            .select("id, kode_unit, status_operasional, jenis_unit:jenis_unit(nama)")
            .not_.in_("status_operasional", list(kecuali))
            .eq("is_active", True)
            .order("kode_unit")
            .execute()
        )
        return [
            (r["id"], r["kode_unit"], r["status_operasional"], (first(r.get("jenis_unit")) or {}).get("nama"))
            for r in rows(res)
        ]
    res = (
        await db.table("unit_trailer")
        .select("id, kode_trailer, status_trailer, jenis:jenis_unit_trailer(nama)")
        .not_.in_("status_trailer", list(kecuali))
        .eq("is_active", True)
        .order("kode_trailer")
        .execute()
    )
    return [
        (r["id"], r["kode_trailer"], r["status_trailer"], (first(r.get("jenis")) or {}).get("nama")) for r in rows(res)
    ]


async def status_aset(db: AsyncClient, jenis_aset: JenisAset, asset_id: str) -> tuple[str, str]:
    """(kode, status) satu aset; NotFoundError bila tidak ada."""
    if jenis_aset == "unit":
        row = single(
            await db.table("units").select("kode_unit, status_operasional").eq("id", asset_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Unit tidak ditemukan")
        return row["kode_unit"], row["status_operasional"]
    row = single(
        await db.table("unit_trailer")
        .select("kode_trailer, status_trailer")
        .eq("id", asset_id)
        .maybe_single()
        .execute()
    )
    if row is None:
        raise NotFoundError("Unit trailer tidak ditemukan")
    return row["kode_trailer"], row["status_trailer"]

"""Laporan perawatan: biaya per aset & rekap klaim per asuransi.

Dasar hitungan = perintah kerja yang tidak dibatalkan dengan tanggal WO di
dalam periode. Hari perbaikan (downtime) = rentang mulai dikerjakan (jadwal
mulai, atau tanggal WO) sampai selesai (atau hari ini bila masih berjalan),
dipotong ke periode laporan.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.pg import num, num_or_none, rows
from app.core.timeutil import today_wib
from app.modules.perintah_kerja.schemas import JenisAset
from app.modules.perintah_kerja.tanggungan import hitung_tanggungan

_SELECT = (
    "id, tanggal, jadwal_mulai, tanggal_selesai, status_wo, pelaksana, unit_id, unit_trailer_id,"
    " total_jasa, total_sparepart, total_lain, total_biaya, polis_id,"
    " unit:units!perintah_kerja_unit_id_fkey(kode_unit),"
    " trailer:unit_trailer!perintah_kerja_unit_trailer_id_fkey(kode_trailer),"
    " polis:polis_asuransi!perintah_kerja_polis_id_fkey(asuransi_id, asuransi:asuransi(nama)),"
    " klaim:klaim_asuransi!klaim_asuransi_perintah_kerja_id_fkey(status, status_klaim, nilai_diajukan,"
    " nilai_disetujui, own_risk)"
)


class BiayaPerawatanRow(BaseModel):
    jenis_aset: JenisAset
    aset_id: str
    kode_aset: str
    jumlah_wo: int
    total_jasa: float
    total_sparepart: float
    total_lain: float
    total_biaya: float
    ditanggung_asuransi: float
    ditanggung_perusahaan: float
    hari_perbaikan: int


class KlaimAsuransiRow(BaseModel):
    asuransi_id: str
    asuransi_nama: str
    jumlah_klaim: int
    diajukan: int
    disetujui: int
    ditolak: int
    dibayar: int
    nilai_diajukan: float
    nilai_disetujui: float


def _klaim(r: dict[str, Any]) -> dict[str, Any] | None:
    data = r.get("klaim")
    daftar = data if isinstance(data, list) else ([data] if data else [])
    return next((k for k in daftar if k.get("status", 1) == 1), None)


def hari_perbaikan(r: dict[str, Any], dari: date, sampai: date, hari_ini: date) -> int:
    if r["status_wo"] not in ("dikerjakan", "menunggu_sparepart", "menunggu_asuransi", "selesai"):
        return 0
    mulai = date.fromisoformat(str(r.get("jadwal_mulai") or r["tanggal"])[:10])
    akhir = date.fromisoformat(str(r["tanggal_selesai"])[:10]) if r.get("tanggal_selesai") else hari_ini
    mulai, akhir = max(mulai, dari), min(akhir, sampai)
    return max((akhir - mulai).days + 1, 0)


async def _data(db: AsyncClient, dari: date, sampai: date) -> list[dict[str, Any]]:
    res = await (
        db.table("perintah_kerja")
        .select(_SELECT)
        .eq("klaim.status", 1)
        .neq("status_wo", "dibatalkan")
        .gte("tanggal", dari.isoformat())
        .lte("tanggal", sampai.isoformat())
        .execute()
    )
    return rows(res)


def _bulatkan(d: dict[str, Any]) -> dict[str, Any]:
    return {k: round(v, 2) if isinstance(v, float) else v for k, v in d.items()}


async def biaya_perawatan(db: AsyncClient, dari: date, sampai: date) -> list[BiayaPerawatanRow]:
    hari_ini = today_wib()
    per_aset: dict[str, dict[str, Any]] = {}
    for r in await _data(db, dari, sampai):
        jenis: JenisAset = "unit" if r.get("unit_id") else "unit_trailer"
        aset_id = r.get("unit_id") or r.get("unit_trailer_id")
        kode = (r.get("unit") or {}).get("kode_unit") or (r.get("trailer") or {}).get("kode_trailer") or "—"
        k = _klaim(r) or {}
        tg = hitung_tanggungan(
            num(r.get("total_biaya")),
            pelaksana=r["pelaksana"],
            status_klaim=k.get("status_klaim"),
            nilai_diajukan=num_or_none(k.get("nilai_diajukan")),
            nilai_disetujui=num_or_none(k.get("nilai_disetujui")),
            own_risk=num_or_none(k.get("own_risk")),
        )
        a = per_aset.setdefault(
            f"{jenis}:{aset_id}",
            {"jenis_aset": jenis, "aset_id": aset_id, "kode_aset": kode, "jumlah_wo": 0, "total_jasa": 0.0,
             "total_sparepart": 0.0, "total_lain": 0.0, "total_biaya": 0.0, "ditanggung_asuransi": 0.0,
             "ditanggung_perusahaan": 0.0, "hari_perbaikan": 0},
        )  # fmt: skip
        a["jumlah_wo"] += 1
        a["total_jasa"] += num(r.get("total_jasa"))
        a["total_sparepart"] += num(r.get("total_sparepart"))
        a["total_lain"] += num(r.get("total_lain"))
        a["total_biaya"] += tg.total
        a["ditanggung_asuransi"] += tg.asuransi
        a["ditanggung_perusahaan"] += tg.perusahaan
        a["hari_perbaikan"] += hari_perbaikan(r, dari, sampai, hari_ini)
    hasil = [BiayaPerawatanRow.model_validate(_bulatkan(a)) for a in per_aset.values()]
    return sorted(hasil, key=lambda x: (-x.total_biaya, x.kode_aset))


async def rekap_klaim(db: AsyncClient, dari: date, sampai: date) -> list[KlaimAsuransiRow]:
    per: dict[str, dict[str, Any]] = {}
    for r in await _data(db, dari, sampai):
        k = _klaim(r)
        polis = r.get("polis") or {}
        if r["pelaksana"] != "asuransi" or not k or not polis:
            continue
        a = per.setdefault(
            polis["asuransi_id"],
            {"asuransi_id": polis["asuransi_id"], "asuransi_nama": (polis.get("asuransi") or {}).get("nama") or "—",
             "jumlah_klaim": 0, "diajukan": 0, "disetujui": 0, "ditolak": 0, "dibayar": 0,
             "nilai_diajukan": 0.0, "nilai_disetujui": 0.0},
        )  # fmt: skip
        a["jumlah_klaim"] += 1
        status = k["status_klaim"]
        a["diajukan" if status in ("diajukan", "survei") else status] += 1
        a["nilai_diajukan"] += num(k.get("nilai_diajukan"))
        if status in ("disetujui", "dibayar"):
            a["nilai_disetujui"] += num(k.get("nilai_disetujui"))
    return sorted((KlaimAsuransiRow(**a) for a in per.values()), key=lambda x: x.asuransi_nama)

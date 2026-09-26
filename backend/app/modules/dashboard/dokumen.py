"""Dokumen kendaraan & SIM yang perlu diperpanjang — tampil di kartu
"Perlu tindakan" dashboard (bukan notifikasi): STNK, KIR, pajak unit, KIR
unit trailer, dan SIM driver yang sudah habis atau habis dalam 30 hari.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.pg import rows
from app.modules.units.schemas import BUKAN_ARMADA

DOKUMEN_PERINGATAN_HARI = 30


class DokumenJatuhTempo(BaseModel):
    label: str  # STNK / KIR / Pajak kendaraan / SIM
    subjek: str  # kode unit / kode trailer / nama driver
    href: str
    tanggal: str  # berlaku sampai (YYYY-MM-DD)
    sisa_hari: int  # negatif = sudah lewat


async def dokumen_jatuh_tempo(db: AsyncClient, hari_ini: date) -> list[DokumenJatuhTempo]:
    """Urut dari yang paling mendesak (sudah habis paling lama dulu)."""
    units_res, trailers_res, drivers_res = await asyncio.gather(
        db.table("units")
        .select("id, kode_unit, stnk_berlaku_sampai, kir_berlaku_sampai, pajak_berlaku_sampai")
        .eq("is_active", True)
        .not_.in_("status_operasional", list(BUKAN_ARMADA))
        .execute(),
        db.table("unit_trailer")
        .select("id, kode_trailer, kir_berlaku_sampai")
        .eq("is_active", True)
        .not_.in_("status_trailer", list(BUKAN_ARMADA))
        .not_.is_("kir_berlaku_sampai", "null")
        .execute(),
        db.table("drivers")
        .select("id, nama, sim_berlaku_sampai")
        .eq("is_active", True)
        .not_.is_("sim_berlaku_sampai", "null")
        .execute(),
    )

    calon: list[tuple[str, str, str, str | None]] = []
    for u in rows(units_res):
        for key, label in (("stnk", "STNK"), ("kir", "KIR"), ("pajak", "Pajak kendaraan")):
            calon.append((label, u["kode_unit"], f"/units/{u['id']}", u.get(f"{key}_berlaku_sampai")))
    for t in rows(trailers_res):
        calon.append(("KIR", t["kode_trailer"], f"/unit-trailer/{t['id']}", t.get("kir_berlaku_sampai")))
    for d in rows(drivers_res):
        calon.append(("SIM", d["nama"], f"/drivers/{d['id']}/edit", d.get("sim_berlaku_sampai")))

    out: list[DokumenJatuhTempo] = []
    for label, subjek, href, tanggal in calon:
        if not tanggal:
            continue
        sisa = (datetime.fromisoformat(tanggal[:10]).date() - hari_ini).days
        if sisa > DOKUMEN_PERINGATAN_HARI:
            continue
        out.append(DokumenJatuhTempo(label=label, subjek=subjek, href=href, tanggal=tanggal[:10], sisa_hari=sisa))
    out.sort(key=lambda d: d.sisa_hari)
    return out

"""Laporan laba tahunan: omset, uang jalan, biaya lainnya, dan profit per bulan.

BATASAN: dasar laporan = tagihan. Hanya pekerjaan yang sudah dibuatkan
tagihan (tidak batal; draft ikut) yang dihitung, dan omset beserta seluruh
biaya proyeknya jatuh di bulan TANGGAL TAGIHAN. Semua angka di luar PPN.

BATASAN: proyek kosongan (tanpa customer) tidak ditagih, tapi uang jalan dan
biaya lainnya tetap mengurangi profit — jatuh di bulan TANGGAL BONGKAR (WIB)
terakhir, setelah semua job-nya bongkar. Muat 30 September, bongkar
1 Oktober → Oktober.

BATASAN: biaya lainnya = Biaya Lain job (master Jenis Biaya). Biaya repair
insiden tidak dihitung di laporan ini (keputusan user, 2026-10-03).

Pengumpulan angka dari database: get_laba_tahunan & _laba_proyek_bulan
(migration 20261003000007–09).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.pg import first, num, rows
from app.modules.invoices.schemas import ProyekProfitabilityRow
from app.modules.invoices.service import InvoiceService


class LabaBulanRow(BaseModel):
    bulan: int
    jumlah_tagihan: int
    jumlah_proyek: int
    omset: float
    dibayar: float
    # Total (proyek ditagih + kosongan); porsi kosongan dirinci di bawah.
    uang_jalan: float
    # Biaya Lain job (total ditagih + kosongan).
    biaya_lainnya: float
    jumlah_kosongan: int
    uang_jalan_kosongan: float
    biaya_lainnya_kosongan: float
    profit: float
    # Persen profit terhadap omset; None bila omset nol.
    margin: float | None


class ProyekBelumDitagihRow(BaseModel):
    proyek_id: str
    nomor_proyek: str
    customer_nama: str
    unit_kode: str
    etd_awal: str
    jumlah_job: int
    uang_jalan: float
    biaya_lainnya: float


class BelumDitagih(BaseModel):
    jumlah: int
    uang_jalan: float
    biaya_lainnya: float
    daftar: list[ProyekBelumDitagihRow]


class LabaTahunan(BaseModel):
    tahun: int
    bulan: list[LabaBulanRow]
    belum_ditagih: BelumDitagih


def susun_bulan(data: list[dict[str, Any]]) -> list[LabaBulanRow]:
    hasil: list[LabaBulanRow] = []
    for r in data:
        omset = num(r.get("omset"))
        uang_jalan_kosongan = num(r.get("uang_jalan_kosongan"))
        uang_jalan = num(r.get("uang_jalan")) + uang_jalan_kosongan
        lainnya_kosongan = num(r.get("biaya_lainnya_kosongan"))
        lainnya = num(r.get("biaya_lainnya")) + lainnya_kosongan
        profit = omset - uang_jalan - lainnya
        hasil.append(
            LabaBulanRow(
                bulan=int(r["bulan"]),
                jumlah_tagihan=int(r.get("jumlah_tagihan") or 0),
                jumlah_proyek=int(r.get("jumlah_proyek") or 0),
                omset=omset,
                dibayar=num(r.get("dibayar")),
                uang_jalan=uang_jalan,
                biaya_lainnya=lainnya,
                jumlah_kosongan=int(r.get("jumlah_kosongan") or 0),
                uang_jalan_kosongan=uang_jalan_kosongan,
                biaya_lainnya_kosongan=lainnya_kosongan,
                profit=profit,
                margin=round(profit / omset * 100, 1) if omset else None,
            )
        )
    return hasil


def selesai_belum_ditagih(p: ProyekProfitabilityRow) -> bool:
    """Semua job selesai tapi belum ada tagihannya (kosongan memang tidak ditagih)."""
    return p.invoice_id is None and p.semua_selesai and not p.kosongan


def susun_belum_ditagih(proyek: list[ProyekProfitabilityRow], lainnya_per_proyek: dict[str, float]) -> BelumDitagih:
    """Proyek selesai belum ditagih — biayanya sudah keluar tapi belum masuk laporan."""
    daftar = [
        ProyekBelumDitagihRow(
            proyek_id=p.proyek_id,
            nomor_proyek=p.nomor_proyek,
            customer_nama=p.customer_nama,
            unit_kode=p.unit_kode,
            etd_awal=p.etd_awal,
            jumlah_job=p.jumlah_job,
            uang_jalan=p.uang_jalan,
            biaya_lainnya=lainnya_per_proyek.get(p.proyek_id, 0.0),
        )
        for p in proyek
        if selesai_belum_ditagih(p)
    ]
    daftar.sort(key=lambda d: d.etd_awal)
    return BelumDitagih(
        jumlah=len(daftar),
        uang_jalan=sum(d.uang_jalan for d in daftar),
        biaya_lainnya=sum(d.biaya_lainnya for d in daftar),
        daftar=daftar,
    )


async def _biaya_lain_per_proyek(db: AsyncClient, proyek_ids: list[str]) -> dict[str, float]:
    """Biaya Lain job aktif (bukan cancelled) dijumlah per proyek."""
    if not proyek_ids:
        return {}
    res = await (
        db.table("biaya_lain")
        .select("nominal, job:jobs!inner(proyek_id, status_job)")
        .in_("job.proyek_id", proyek_ids)
        .neq("job.status_job", "cancelled")
        .execute()
    )
    hasil: dict[str, float] = defaultdict(float)
    for r in rows(res):
        pid = (first(r.get("job")) or {}).get("proyek_id")
        if pid:
            hasil[str(pid)] += num(r.get("nominal"))
    return hasil


async def laba_tahunan(db: AsyncClient, tahun: int) -> LabaTahunan:
    data = rows(await db.rpc("get_laba_tahunan", {"p_tahun": tahun}).execute())
    proyek = await InvoiceService(db).proyek_profitability(start=None, end=None)
    belum = [p.proyek_id for p in proyek if selesai_belum_ditagih(p)]
    return LabaTahunan(
        tahun=tahun,
        bulan=susun_bulan(data),
        belum_ditagih=susun_belum_ditagih(proyek, await _biaya_lain_per_proyek(db, belum)),
    )

from __future__ import annotations

from typing import Any

from supabase import AsyncClient

from app.core.errors import ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.domain.uang_jalan import hitung_ringkasan
from app.modules.uang_jalan.schemas import (
    JobUangJalan,
    SumberDana,
    UangJalan,
    UangJalanInput,
    UangJalanJobRow,
)

UANG_JALAN_SELECT = """
  id, job_id, jenis, tanggal, jumlah, sumber_dana_id, keperluan, catatan, created_at,
  sumber:sumber_dana(nama),
  creator:profiles(nama)
"""


def _to_uang_jalan(r: dict[str, Any]) -> UangJalan:
    return UangJalan(
        id=r["id"],
        job_id=r["job_id"],
        jenis=r["jenis"],
        tanggal=r["tanggal"],
        jumlah=num(r.get("jumlah")),
        sumber_dana_id=r.get("sumber_dana_id"),
        sumber_dana_nama=(first(r.get("sumber")) or {}).get("nama"),
        keperluan=r.get("keperluan"),
        catatan=r.get("catatan"),
        created_by_nama=(first(r.get("creator")) or {}).get("nama"),
        created_at=r["created_at"],
    )


def _validate(payload: UangJalanInput) -> None:
    """Pencairan wajib menyebut kasnya (ekspor Excel butuh kolomnya); penambahan
    pagu tidak boleh punya sumber karena tidak ada uang yang berpindah."""
    if payload.jumlah <= 0:
        raise ValidationError("Jumlah harus lebih dari nol")
    if payload.jenis == "pencairan" and not payload.sumber_dana_id:
        raise ValidationError("Uang yang dikasih harus menyebut dari kas mana")
    if payload.jenis == "penambahan_pagu" and payload.sumber_dana_id:
        raise ValidationError("Penambahan pagu tidak memakai sumber dana — itu kesepakatan, bukan uang keluar")


def _clean(payload: UangJalanInput) -> dict[str, Any]:
    return {
        "job_id": payload.job_id,
        "jenis": payload.jenis,
        "tanggal": payload.tanggal,
        "jumlah": round(payload.jumlah),
        "sumber_dana_id": payload.sumber_dana_id if payload.jenis == "pencairan" else None,
        "keperluan": clean_text(payload.keperluan),
        "catatan": clean_text(payload.catatan),
    }


class UangJalanService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def list_sumber_dana(self, *, only_active: bool = True) -> list[SumberDana]:
        q = (
            self._db.table("sumber_dana")
            .select("id, nama, bank, pemegang, kolom_excel, urutan, is_active")
            .order("urutan")
            .order("nama")
        )
        if only_active:
            q = q.eq("is_active", True)
        return [SumberDana(**r) for r in rows(await q.execute())]

    async def list_by_job(self, job_id: str) -> list[UangJalan]:
        res = await (
            self._db.table("uang_jalan")
            .select(UANG_JALAN_SELECT)
            .eq("job_id", job_id)
            .order("tanggal")
            .order("created_at")
            .execute()
        )
        return [_to_uang_jalan(r) for r in rows(res)]

    async def job_summary(self, job_id: str) -> JobUangJalan:
        job = single(await self._db.table("jobs").select("uang_jalan_pagu").eq("id", job_id).maybe_single().execute())
        transaksi = await self.list_by_job(job_id)
        return JobUangJalan(
            transaksi=transaksi,
            ringkasan=hitung_ringkasan(num((job or {}).get("uang_jalan_pagu")), transaksi),  # type: ignore[arg-type]
        )

    async def list_jobs(
        self, *, hanya_belum_lunas: bool = False, hanya_berjalan: bool = False
    ) -> list[UangJalanJobRow]:
        """Daftar job beserta posisi uang jalannya. Transaksi diambil sekaligus lewat
        relasi lalu dijumlahkan di sini — cukup untuk ratusan job per bulan."""
        res = await (
            self._db.table("jobs")
            .select(
                "id, job_number, status, asal, tujuan, etd, uang_jalan_pagu,"
                " unit:units(kode_unit), driver:drivers(nama),"
                " customer:customers(nama_perusahaan),"
                " uang_jalan(id, jenis, jumlah, tanggal)"
            )
            .neq("status", "cancelled")
            .order("etd", desc=True)
            .execute()
        )
        out: list[UangJalanJobRow] = []
        for r in rows(res):
            transaksi = [
                UangJalan(
                    id=t["id"],
                    job_id=r["id"],
                    jenis=t["jenis"],
                    tanggal=t["tanggal"],
                    jumlah=num(t.get("jumlah")),
                    created_at=t["tanggal"],
                )
                for t in (r.get("uang_jalan") or [])
            ]
            ringkasan = hitung_ringkasan(num(r.get("uang_jalan_pagu")), transaksi)  # type: ignore[arg-type]
            pencairan = sorted(t.tanggal for t in transaksi if t.jenis == "pencairan")
            out.append(
                UangJalanJobRow(
                    job_id=r["id"],
                    job_number=r["job_number"],
                    status=r["status"],
                    asal=r["asal"],
                    tujuan=r["tujuan"],
                    etd=r["etd"],
                    unit_kode=(first(r.get("unit")) or {}).get("kode_unit"),
                    driver_nama=(first(r.get("driver")) or {}).get("nama"),
                    customer_nama=(first(r.get("customer")) or {}).get("nama_perusahaan"),
                    ringkasan=ringkasan,
                    pencairan_terakhir=pencairan[-1] if pencairan else None,
                )
            )
        if hanya_belum_lunas:
            out = [r for r in out if r.ringkasan.sisa > 0]
        if hanya_berjalan:
            out = [r for r in out if r.status != "selesai"]
        return out

    async def create(self, payload: UangJalanInput, *, created_by: str | None) -> UangJalan:
        _validate(payload)
        res = await self._db.table("uang_jalan").insert({**_clean(payload), "created_by": created_by}).execute()
        created_id = rows(res)[0]["id"]
        full = await self._db.table("uang_jalan").select(UANG_JALAN_SELECT).eq("id", created_id).execute()
        return _to_uang_jalan(rows(full)[0])

    async def update(self, uang_jalan_id: str, payload: UangJalanInput) -> None:
        _validate(payload)
        await self._db.table("uang_jalan").update(_clean(payload)).eq("id", uang_jalan_id).execute()

    async def delete(self, uang_jalan_id: str) -> None:
        await self._db.table("uang_jalan").delete().eq("id", uang_jalan_id).execute()

    async def set_pagu(self, job_id: str, pagu: float) -> None:
        """Pagu awal disimpan di job (angka kesepakatan), kenaikan sesudahnya
        dicatat sebagai transaksi 'penambahan_pagu' supaya ada jejaknya."""
        await self._db.table("jobs").update({"uang_jalan_pagu": round(pagu)}).eq("id", job_id).execute()

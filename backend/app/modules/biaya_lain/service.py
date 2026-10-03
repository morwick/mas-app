"""Biaya lain per job (tol, parkir, bongkar muat, dst).

Murni biaya perusahaan — tidak masuk tagihan customer — dan mengurangi profit
di laporan Laba tahunan (kolom biaya tambahan).

BATASAN: tambah / ubah / hapus hanya selama job belum masuk tagihan yang
tidak batal (sama dengan uang jalan). Dicek di sini supaya pesannya jelas;
trigger trg_biaya_lain_cek_tagihan (migration 20261003000009) penjaga
terakhir. Setiap tulis satu permintaan Data API = satu transaksi database;
log sistem dicatat trigger trg_log_sistem.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator
from supabase import AsyncClient

from app.core.errors import NotFoundError, ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.core.soft_delete import AKTIF, DIHAPUS, STATUS
from app.core.transaksi import Transaksi
from app.modules.jenis_biaya.router import bersihkan_nama, kunci_nama

_SELECT = """
  id, job_id, jenis_biaya_id, nominal, catatan, created_at,
  jenis:jenis_biaya(nama),
  creator:profiles(nama)
"""


class BiayaLain(BaseModel):
    id: str
    job_id: str
    jenis_biaya_id: str
    jenis_biaya_nama: str
    nominal: float
    catatan: str | None = None
    created_by_nama: str | None = None
    created_at: str


class BiayaLainInput(BaseModel):
    # Pilih dari daftar (id) ATAU ketik jenis baru (nama) — salah satu wajib.
    jenis_biaya_id: str | None = None
    jenis_biaya_nama: str | None = Field(default=None, max_length=80)
    nominal: float
    catatan: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _jenis_wajib(self) -> BiayaLainInput:
        if not (self.jenis_biaya_id or (self.jenis_biaya_nama or "").strip()):
            raise ValueError("Jenis biaya wajib dipilih atau diketik")
        return self


class BiayaLainCreate(BiayaLainInput):
    job_id: str = Field(min_length=1)


def to_biaya_lain(r: dict[str, Any]) -> BiayaLain:
    return BiayaLain(
        id=r["id"],
        job_id=r["job_id"],
        jenis_biaya_id=r["jenis_biaya_id"],
        jenis_biaya_nama=(first(r.get("jenis")) or {}).get("nama") or "—",
        nominal=num(r.get("nominal")),
        catatan=r.get("catatan"),
        created_by_nama=(first(r.get("creator")) or {}).get("nama"),
        created_at=str(r["created_at"]),
    )


def validasi_nominal(nominal: float) -> int:
    """BATASAN: nominal rupiah bulat dan lebih dari 0."""
    if nominal <= 0:
        raise ValidationError("Nominal biaya lain harus lebih dari 0")
    if nominal != int(nominal):
        raise ValidationError("Nominal biaya lain harus bilangan rupiah bulat")
    return int(nominal)


class BiayaLainService:
    def __init__(self, db: AsyncClient) -> None:
        self._db = db

    async def list_job(self, job_id: str) -> list[BiayaLain]:
        res = await self._db.table("biaya_lain").select(_SELECT).eq("job_id", job_id).order("created_at").execute()
        return [to_biaya_lain(r) for r in rows(res)]

    async def _tolak_bila_sudah_ditagih(self, job_id: str) -> None:
        res = await (
            self._db.table("invoice_items")
            .select("invoice:invoices!inner(invoice_number)")
            .eq("job_id", job_id)
            .eq("status", AKTIF)
            .eq("invoice.status", AKTIF)
            .neq("invoice.status_tagihan", "batal")
            .limit(1)
            .execute()
        )
        ada = rows(res)
        if ada:
            nomor = (first(ada[0].get("invoice")) or {}).get("invoice_number") or ""
            raise ValidationError(
                f"Job ini sudah ditagihkan di tagihan {nomor} — "
                "biaya lain tidak bisa ditambah, diubah, atau dihapus lagi."
            )

    async def _siapkan_jenis(self, tx: Transaksi, payload: BiayaLainInput, *, created_by: str | None) -> str:
        """Tentukan jenis_biaya_id untuk biaya ini.

        - `jenis_biaya_id` diisi → harus ada di master.
        - hanya `jenis_biaya_nama` → dicocokkan dengan master (tanpa beda huruf
          besar/kecil & spasi); belum ada → jenis baru ditambahkan ke `tx`,
          jadi tersimpan bersama biaya lainnya (atau tidak sama sekali).
        """
        if payload.jenis_biaya_id:
            jenis = single(
                await self._db.table("jenis_biaya")
                .select("id")
                .eq("id", payload.jenis_biaya_id)
                .maybe_single()
                .execute()
            )
            if jenis is None:
                raise ValidationError("Jenis biaya tidak ditemukan atau sudah dihapus")
            return payload.jenis_biaya_id
        nama = bersihkan_nama(payload.jenis_biaya_nama or "")
        kunci = kunci_nama(nama)
        for r in rows(await self._db.table("jenis_biaya").select("id, nama").execute()):
            if kunci_nama(str(r.get("nama") or "")) == kunci:
                return str(r["id"])
        return tx.insert("jenis_biaya", {"nama": nama, "created_by": created_by})["id"]

    async def _job_id(self, biaya_id: str) -> str:
        row = single(await self._db.table("biaya_lain").select("job_id").eq("id", biaya_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Biaya lain tidak ditemukan")
        return str(row["job_id"])

    async def create(self, payload: BiayaLainCreate, *, created_by: str | None) -> BiayaLain:
        nominal = validasi_nominal(payload.nominal)
        await self._tolak_bila_sudah_ditagih(payload.job_id)
        # Satu transaksi: jenis biaya baru (bila diketik) + biaya lainnya.
        tx = Transaksi(self._db)
        jenis_id = await self._siapkan_jenis(tx, payload, created_by=created_by)
        tx.insert(
            "biaya_lain",
            {
                "job_id": payload.job_id,
                "jenis_biaya_id": jenis_id,
                "nominal": nominal,
                "catatan": clean_text(payload.catatan),
                "created_by": created_by,
            },
        )
        hasil = await tx.jalankan()
        return await self._ambil(hasil[-1][0]["id"])

    async def update(self, biaya_id: str, payload: BiayaLainInput, *, created_by: str | None = None) -> BiayaLain:
        nominal = validasi_nominal(payload.nominal)
        await self._tolak_bila_sudah_ditagih(await self._job_id(biaya_id))
        tx = Transaksi(self._db)
        jenis_id = await self._siapkan_jenis(tx, payload, created_by=created_by)
        tx.update(
            "biaya_lain",
            {"jenis_biaya_id": jenis_id, "nominal": nominal, "catatan": clean_text(payload.catatan)},
            {"id": biaya_id},
        )
        await tx.jalankan()
        return await self._ambil(biaya_id)

    async def delete(self, biaya_id: str) -> None:
        await self._tolak_bila_sudah_ditagih(await self._job_id(biaya_id))
        await self._db.table("biaya_lain").update({STATUS: DIHAPUS}).eq("id", biaya_id).execute()

    async def _ambil(self, biaya_id: str) -> BiayaLain:
        row = single(await self._db.table("biaya_lain").select(_SELECT).eq("id", biaya_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Biaya lain tidak ditemukan")
        return to_biaya_lain(row)

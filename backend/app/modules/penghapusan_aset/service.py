"""Penghapusan Unit & Unit Trailer — superadmin saja.

Satu-satunya jalan menandai aset "Diafkirkan". Mencatat & membatalkan lewat
fungsi database `catat_penghapusan_aset` / `batalkan_penghapusan_aset`
(migration 20260926000008): satu fungsi = satu transaksi (baris penghapusan
+ status aset + insiden yang ditutup / dibuka lagi, sekaligus).
"""

from __future__ import annotations

from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import first, rows, single
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.timeutil import iso_utc
from app.modules.penghapusan_aset.schemas import (
    AsetDihapus,
    BatalkanPenghapusanInput,
    PenghapusanAset,
    PenghapusanAsetInput,
    PenghapusanAsetUbah,
)
from app.modules.penjualan_unit.aset import (
    ASET_DOKUMEN_SELECT,
    JenisAset,
    aset_dokumen,
    daftar_aset,
    insiden_terbuka_per_aset,
    job_aktif_per_aset,
    label_aset,
    status_aset,
)

SELECT = f"""
  id, nomor_berita_acara, jenis_aset, unit_id, unit_trailer_id, tanggal_hapus, alasan, catatan,
  status_aset_sebelum, bukti_path, bukti_uploaded_at, created_at,
  {ASET_DOKUMEN_SELECT},
  created_by_profile:profiles!penghapusan_aset_created_by_fkey(nama)
"""

BUKTI_SIGNED_URL_TTL_S = 60 * 60

# Sudah keluar dari armada — tidak tampil di pilihan.
_SUDAH_KELUAR = ("terjual", "diafkirkan")


def alasan_tidak_bisa_dihapus(jenis_aset: JenisAset, kode: str, status: str, job_aktif: str | None) -> str | None:
    """Pesan kenapa aset tidak bisa dihapus, atau None bila boleh."""
    label = label_aset(jenis_aset)
    if status in _SUDAH_KELUAR:
        return f"Tidak bisa menghapus {label} {kode} karena {label} sudah {status}."
    if status == "bertugas" or job_aktif:
        job = f" (job {job_aktif} belum selesai)" if job_aktif else ""
        return (
            f"Tidak bisa menghapus {label} {kode} karena {label} sedang bertugas{job}. "
            "Selesaikan atau batalkan job-nya dulu."
        )
    return None


def _kode_aset(r: dict[str, Any]) -> str:
    if r.get("jenis_aset") == "unit":
        return (first(r.get("unit")) or {}).get("kode_unit") or "—"
    return (first(r.get("unit_trailer")) or {}).get("kode_trailer") or "—"


class PenghapusanAsetService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().bukti_penghapusan_bucket

    async def _signed_bukti_url(self, path: str | None) -> str | None:
        if not path:
            return None
        try:
            res = await self._db.storage.from_(self._bucket).create_signed_url(path, BUKTI_SIGNED_URL_TTL_S)
            return res.get("signedURL") or res.get("signedUrl")
        except Exception:  # noqa: BLE001 — bukti yang tidak terbaca jangan gagalkan halaman
            return None

    async def _to_row(self, r: dict[str, Any], *, with_url: bool) -> PenghapusanAset:
        return PenghapusanAset(
            id=r["id"],
            nomor_berita_acara=r.get("nomor_berita_acara"),
            jenis_aset=r["jenis_aset"],
            unit_id=r.get("unit_id"),
            unit_trailer_id=r.get("unit_trailer_id"),
            kode_aset=_kode_aset(r),
            tanggal_hapus=r["tanggal_hapus"],
            alasan=r["alasan"],
            catatan=r.get("catatan"),
            status_aset_sebelum=r.get("status_aset_sebelum"),
            bukti_uploaded_at=r.get("bukti_uploaded_at"),
            bukti_url=await self._signed_bukti_url(r.get("bukti_path")) if with_url else None,
            created_by_nama=(first(r.get("created_by_profile")) or {}).get("nama"),
            created_at=r["created_at"],
            aset=aset_dokumen(r),
        )

    async def list_page(
        self, *, params: PageParams, q: str | None, jenis_aset: JenisAset | None
    ) -> Page[PenghapusanAset]:
        query = self._db.table("penghapusan_aset").select(SELECT, count=CountMethod.exact)
        if jenis_aset:
            query = query.eq("jenis_aset", jenis_aset)
        if q and q.strip():
            query = query.or_(ilike_any(["alasan", "catatan", "nomor_berita_acara"], q))
        res = await apply_window(query.order("tanggal_hapus", desc=True).order("id"), params).execute()
        items = [await self._to_row(r, with_url=False) for r in rows(res)]
        return build_page(items, res.count, params)

    async def get(self, penghapusan_id: str) -> PenghapusanAset:
        row = single(
            await self._db.table("penghapusan_aset").select(SELECT).eq("id", penghapusan_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Catatan penghapusan tidak ditemukan")
        return await self._to_row(row, with_url=True)

    async def aset_pilihan(self, jenis_aset: JenisAset) -> list[AsetDihapus]:
        """Unit/unit trailer yang belum Terjual / Diafkirkan. Yang sedang
        Bertugas tetap tampil, dengan alasan kenapa tidak bisa dihapus."""
        job_aktif = await job_aktif_per_aset(self._db, jenis_aset)
        insiden = await insiden_terbuka_per_aset(self._db, jenis_aset)
        data = await daftar_aset(self._db, jenis_aset, kecuali=_SUDAH_KELUAR)
        return [
            AsetDihapus(
                id=id_,
                kode=kode,
                jenis_nama=jenis,
                status=status,
                alasan_tidak_bisa=alasan_tidak_bisa_dihapus(jenis_aset, kode, status, job_aktif.get(id_)),
                insiden_terbuka=insiden.get(id_, 0),
            )
            for id_, kode, status, jenis in data
        ]

    async def _cek_boleh_dihapus(self, jenis_aset: JenisAset, asset_id: str) -> None:
        """Tolak lebih awal dengan pesan jelas; fungsi DB tetap memeriksa ulang."""
        kode, status = await status_aset(self._db, jenis_aset, asset_id)
        job = (await job_aktif_per_aset(self._db, jenis_aset)).get(asset_id)
        alasan = alasan_tidak_bisa_dihapus(jenis_aset, kode, status, job)
        if alasan:
            raise ValidationError(alasan)

    async def create(self, payload: PenghapusanAsetInput) -> str:
        await self._cek_boleh_dihapus(payload.jenis_aset, payload.asset_id)
        res = await self._db.rpc(
            "catat_penghapusan_aset",
            {
                "p_jenis_aset": payload.jenis_aset,
                "p_asset_id": payload.asset_id,
                "p_tanggal_hapus": payload.tanggal_hapus,
                "p_alasan": payload.alasan,
                "p_catatan": payload.catatan,
            },
        ).execute()
        return str(res.data)

    async def update(self, penghapusan_id: str, payload: PenghapusanAsetUbah) -> None:
        """Hanya selama berita acara bertanda tangan belum diunggah (dijaga fungsi DB)."""
        await self._db.rpc(
            "ubah_penghapusan_aset",
            {
                "p_id": penghapusan_id,
                "p_tanggal_hapus": payload.tanggal_hapus,
                "p_alasan": payload.alasan,
                "p_catatan": payload.catatan,
            },
        ).execute()

    async def batalkan(self, penghapusan_id: str, payload: BatalkanPenghapusanInput) -> None:
        await self._db.rpc(
            "batalkan_penghapusan_aset",
            {
                "p_id": penghapusan_id,
                "p_alasan": payload.alasan,
                "p_insiden": [i.model_dump() for i in payload.insiden],
            },
        ).execute()

    async def upload_bukti(self, penghapusan_id: str, *, data: bytes, content_type: str | None) -> None:
        row = single(
            await self._db.table("penghapusan_aset")
            .select("id, bukti_path")
            .eq("id", penghapusan_id)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise NotFoundError("Catatan penghapusan tidak ditemukan")
        ext = validate_document(content_type, len(data))
        path = f"{penghapusan_id}/{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "application/pdf")
        try:
            await (
                self._db.table("penghapusan_aset")
                .update({"bukti_path": path, "bukti_uploaded_at": iso_utc()})
                .eq("id", penghapusan_id)
                .execute()
            )
        except Exception:
            await remove_object_quietly(self._db, self._bucket, path)
            raise
        lama = row.get("bukti_path")
        if lama and lama != path:
            await remove_object_quietly(self._db, self._bucket, lama)

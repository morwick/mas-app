"""Penjualan Unit & Unit Trailer — superadmin saja.

Mencatat & membatalkan penjualan lewat fungsi database `catat_penjualan_unit`/
`batalkan_penjualan_unit` (migration 20260925000005): satu fungsi = satu
transaksi (insert baris + ubah status aset jadi Terjual/Standby, sekaligus).
Pesan gagal dari fungsi (mis. "Unit X masih dipakai job Y") sudah berbahasa
Indonesia dan diteruskan apa adanya oleh handler global (app/core/errors.py).
"""

from __future__ import annotations

from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import first, num, rows, single
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.timeutil import iso_utc
from app.modules.penjualan_unit.aset import (
    ASET_DOKUMEN_SELECT,
    aset_dokumen,
    daftar_aset,
    insiden_terbuka_per_aset,
    job_aktif_per_aset,
    label_aset,
    status_aset,
)
from app.modules.penjualan_unit.schemas import (
    AsetTerjual,
    DokumenTtd,
    JenisAset,
    PenjualanUnit,
    PenjualanUnitInput,
    PenjualanUnitUbah,
)

SELECT = f"""
  id, nomor_surat, nomor_bast, jenis_aset, unit_id, unit_trailer_id, nama_pembeli, no_hp_pembeli, email_pembeli,
  harga_jual, tanggal_jual, catatan, bukti_path, bukti_uploaded_at, bukti_bast_path, bukti_bast_uploaded_at,
  penyerah_nama, penyerah_jabatan, created_at,
  {ASET_DOKUMEN_SELECT},
  created_by_profile:profiles!penjualan_unit_created_by_fkey(nama)
"""

BUKTI_SIGNED_URL_TTL_S = 60 * 60

# Status aset yang tidak boleh dijual (dijaga juga di catat_penjualan_unit,
# migration 20260926000005). Masih dipakai job yang belum selesai = bertugas.
_TIDAK_BISA_DIJUAL = ("bertugas", "perbaikan", "terjual")


def alasan_tidak_bisa_dijual(jenis_aset: JenisAset, kode: str, status: str, job_aktif: str | None) -> str | None:
    """Pesan kenapa aset tidak bisa dijual, atau None bila boleh."""
    label = label_aset(jenis_aset)
    if status == "terjual":
        return f"Tidak bisa menjual {label} {kode} karena {label} sudah terjual."
    if status == "perbaikan":
        return f"Tidak bisa menjual {label} {kode} karena {label} sedang perbaikan."
    if status == "bertugas" or job_aktif:
        job = f" (job {job_aktif} belum selesai)" if job_aktif else ""
        return f"Tidak bisa menjual {label} {kode} karena {label} sedang bertugas{job}."
    return None


def _kode_aset(r: dict[str, Any]) -> str:
    if r.get("jenis_aset") == "unit":
        return (first(r.get("unit")) or {}).get("kode_unit") or "—"
    return (first(r.get("unit_trailer")) or {}).get("kode_trailer") or "—"


class PenjualanUnitService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().bukti_penjualan_bucket

    async def _signed_bukti_url(self, path: str | None) -> str | None:
        if not path:
            return None
        try:
            res = await self._db.storage.from_(self._bucket).create_signed_url(path, BUKTI_SIGNED_URL_TTL_S)
            return res.get("signedURL") or res.get("signedUrl")
        except Exception:  # noqa: BLE001 — bukti yang tidak terbaca jangan gagalkan halaman
            return None

    async def _to_row(self, r: dict[str, Any], *, with_url: bool) -> PenjualanUnit:
        return PenjualanUnit(
            id=r["id"],
            nomor_surat=r.get("nomor_surat"),
            nomor_bast=r.get("nomor_bast"),
            jenis_aset=r["jenis_aset"],
            unit_id=r.get("unit_id"),
            unit_trailer_id=r.get("unit_trailer_id"),
            kode_aset=_kode_aset(r),
            nama_pembeli=r["nama_pembeli"],
            no_hp_pembeli=r.get("no_hp_pembeli"),
            email_pembeli=r.get("email_pembeli"),
            harga_jual=num(r.get("harga_jual")),
            tanggal_jual=r["tanggal_jual"],
            catatan=r.get("catatan"),
            penyerah_nama=r.get("penyerah_nama"),
            penyerah_jabatan=r.get("penyerah_jabatan"),
            bukti_uploaded_at=r.get("bukti_uploaded_at"),
            bukti_bast_uploaded_at=r.get("bukti_bast_uploaded_at"),
            bukti_url=await self._signed_bukti_url(r.get("bukti_path")) if with_url else None,
            bukti_bast_url=await self._signed_bukti_url(r.get("bukti_bast_path")) if with_url else None,
            created_by_nama=(first(r.get("created_by_profile")) or {}).get("nama"),
            created_at=r["created_at"],
            aset=aset_dokumen(r),
        )

    async def list_page(
        self, *, params: PageParams, q: str | None, jenis_aset: JenisAset | None
    ) -> Page[PenjualanUnit]:
        query = self._db.table("penjualan_unit").select(SELECT, count=CountMethod.exact)
        if jenis_aset:
            query = query.eq("jenis_aset", jenis_aset)
        if q and q.strip():
            kolom = ["nama_pembeli", "no_hp_pembeli", "email_pembeli", "nomor_surat", "nomor_bast"]
            query = query.or_(ilike_any(kolom, q))
        res = await apply_window(query.order("tanggal_jual", desc=True).order("id"), params).execute()
        items = [await self._to_row(r, with_url=False) for r in rows(res)]
        return build_page(items, res.count, params)

    async def get(self, penjualan_id: str) -> PenjualanUnit:
        row = single(
            await self._db.table("penjualan_unit").select(SELECT).eq("id", penjualan_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Catatan penjualan tidak ditemukan")
        return await self._to_row(row, with_url=True)

    async def aset_pilihan(self, jenis_aset: JenisAset) -> list[AsetTerjual]:
        """Unit/unit trailer yang belum Terjual. Yang Bertugas / Perbaikan tetap
        tampil, dengan alasan kenapa tidak bisa dijual."""
        job_aktif = await job_aktif_per_aset(self._db, jenis_aset)
        insiden = await insiden_terbuka_per_aset(self._db, jenis_aset)
        data = await daftar_aset(self._db, jenis_aset, kecuali=("terjual",))
        return [
            AsetTerjual(
                id=id_,
                kode=kode,
                jenis_nama=jenis,
                status=status,
                alasan_tidak_bisa=alasan_tidak_bisa_dijual(jenis_aset, kode, status, job_aktif.get(id_)),
                insiden_terbuka=insiden.get(id_, 0),
            )
            for id_, kode, status, jenis in data
        ]

    async def _cek_boleh_dijual(self, jenis_aset: JenisAset, asset_id: str) -> None:
        """Tolak lebih awal dengan pesan jelas; fungsi DB tetap memeriksa ulang."""
        kode, status = await status_aset(self._db, jenis_aset, asset_id)
        job = (await job_aktif_per_aset(self._db, jenis_aset)).get(asset_id)
        alasan = alasan_tidak_bisa_dijual(jenis_aset, kode, status, job)
        if alasan:
            raise ValidationError(alasan)

    async def create(self, payload: PenjualanUnitInput) -> str:
        await self._cek_boleh_dijual(payload.jenis_aset, payload.asset_id)
        res = await self._db.rpc(
            "catat_penjualan_unit",
            {
                "p_jenis_aset": payload.jenis_aset,
                "p_asset_id": payload.asset_id,
                "p_nama_pembeli": payload.nama_pembeli,
                "p_no_hp_pembeli": payload.no_hp_pembeli,
                "p_email_pembeli": payload.email_pembeli,
                "p_harga_jual": payload.harga_jual,
                "p_tanggal_jual": payload.tanggal_jual,
                "p_catatan": payload.catatan,
                "p_penyerah_nama": payload.penyerah_nama,
                "p_penyerah_jabatan": payload.penyerah_jabatan,
            },
        ).execute()
        return str(res.data)

    async def update(self, penjualan_id: str, payload: PenjualanUnitUbah) -> None:
        """Hanya selama belum ada surat / BAST bertanda tangan (dijaga fungsi DB)."""
        await self._db.rpc(
            "ubah_penjualan_unit",
            {
                "p_id": penjualan_id,
                "p_nama_pembeli": payload.nama_pembeli,
                "p_no_hp_pembeli": payload.no_hp_pembeli,
                "p_email_pembeli": payload.email_pembeli,
                "p_harga_jual": payload.harga_jual,
                "p_tanggal_jual": payload.tanggal_jual,
                "p_catatan": payload.catatan,
                "p_penyerah_nama": payload.penyerah_nama,
                "p_penyerah_jabatan": payload.penyerah_jabatan,
            },
        ).execute()

    async def batalkan(self, penjualan_id: str) -> None:
        await self._db.rpc("batalkan_penjualan_unit", {"p_id": penjualan_id}).execute()

    async def upload_bukti(
        self, penjualan_id: str, *, dokumen: DokumenTtd, data: bytes, content_type: str | None
    ) -> None:
        """Surat penjualan / BAST bertanda tangan — masing-masing opsional."""
        kolom = "bukti_path" if dokumen == "surat" else "bukti_bast_path"
        kolom_waktu = "bukti_uploaded_at" if dokumen == "surat" else "bukti_bast_uploaded_at"
        row = single(
            await self._db.table("penjualan_unit")
            .select(f"id, {kolom}")
            .eq("id", penjualan_id)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise NotFoundError("Catatan penjualan tidak ditemukan")
        ext = validate_document(content_type, len(data))
        path = f"{penjualan_id}/{dokumen}-{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "application/pdf")
        try:
            await (
                self._db.table("penjualan_unit")
                .update({kolom: path, kolom_waktu: iso_utc()})
                .eq("id", penjualan_id)
                .execute()
            )
        except Exception:
            await remove_object_quietly(self._db, self._bucket, path)
            raise
        lama = row.get(kolom)
        if lama and lama != path:
            await remove_object_quietly(self._db, self._bucket, lama)

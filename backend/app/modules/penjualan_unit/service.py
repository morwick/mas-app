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
from app.core.errors import NotFoundError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import first, num, rows, single
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.timeutil import iso_utc
from app.modules.penjualan_unit.schemas import AsetTerjual, JenisAset, PenjualanUnit, PenjualanUnitInput

SELECT = """
  id, jenis_aset, unit_id, unit_trailer_id, nama_pembeli, kontak_pembeli,
  harga_jual, tanggal_jual, catatan, bukti_path, bukti_uploaded_at, created_at,
  unit:units(kode_unit),
  unit_trailer:unit_trailer(kode_trailer),
  created_by_profile:profiles!penjualan_unit_created_by_fkey(nama)
"""

BUKTI_SIGNED_URL_TTL_S = 60 * 60


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
            jenis_aset=r["jenis_aset"],
            unit_id=r.get("unit_id"),
            unit_trailer_id=r.get("unit_trailer_id"),
            kode_aset=_kode_aset(r),
            nama_pembeli=r["nama_pembeli"],
            kontak_pembeli=r.get("kontak_pembeli"),
            harga_jual=num(r.get("harga_jual")),
            tanggal_jual=r["tanggal_jual"],
            catatan=r.get("catatan"),
            bukti_uploaded_at=r.get("bukti_uploaded_at"),
            bukti_url=await self._signed_bukti_url(r.get("bukti_path")) if with_url else None,
            created_by_nama=(first(r.get("created_by_profile")) or {}).get("nama"),
            created_at=r["created_at"],
        )

    async def list_page(
        self, *, params: PageParams, q: str | None, jenis_aset: JenisAset | None
    ) -> Page[PenjualanUnit]:
        query = self._db.table("penjualan_unit").select(SELECT, count=CountMethod.exact)
        if jenis_aset:
            query = query.eq("jenis_aset", jenis_aset)
        if q and q.strip():
            query = query.or_(ilike_any(["nama_pembeli"], q))
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
        """Unit/unit trailer berstatus Standby — kandidat yang boleh dijual."""
        if jenis_aset == "unit":
            res = (
                await self._db.table("units")
                .select("id, kode_unit, jenis_unit:jenis_unit(nama)")
                .eq("status_operasional", "standby")
                .eq("is_active", True)
                .order("kode_unit")
                .execute()
            )
            return [
                AsetTerjual(
                    id=r["id"], kode=r["kode_unit"], jenis_nama=(first(r.get("jenis_unit")) or {}).get("nama")
                )
                for r in rows(res)
            ]
        res = (
            await self._db.table("unit_trailer")
            .select("id, kode_trailer, jenis:jenis_unit_trailer(nama)")
            .eq("status_trailer", "standby")
            .order("kode_trailer")
            .execute()
        )
        return [
            AsetTerjual(id=r["id"], kode=r["kode_trailer"], jenis_nama=(first(r.get("jenis")) or {}).get("nama"))
            for r in rows(res)
        ]

    async def create(self, payload: PenjualanUnitInput) -> str:
        res = await self._db.rpc(
            "catat_penjualan_unit",
            {
                "p_jenis_aset": payload.jenis_aset,
                "p_asset_id": payload.asset_id,
                "p_nama_pembeli": payload.nama_pembeli,
                "p_kontak_pembeli": payload.kontak_pembeli,
                "p_harga_jual": payload.harga_jual,
                "p_tanggal_jual": payload.tanggal_jual,
                "p_catatan": payload.catatan,
            },
        ).execute()
        return str(res.data)

    async def batalkan(self, penjualan_id: str) -> None:
        await self._db.rpc("batalkan_penjualan_unit", {"p_id": penjualan_id}).execute()

    async def upload_bukti(self, penjualan_id: str, *, data: bytes, content_type: str | None) -> None:
        row = single(
            await self._db.table("penjualan_unit")
            .select("id, bukti_path")
            .eq("id", penjualan_id)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise NotFoundError("Catatan penjualan tidak ditemukan")
        ext = validate_document(content_type, len(data))
        path = f"{penjualan_id}/{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "application/pdf")
        try:
            await self._db.table("penjualan_unit").update(
                {"bukti_path": path, "bukti_uploaded_at": iso_utc()}
            ).eq("id", penjualan_id).execute()
        except Exception:
            await remove_object_quietly(self._db, self._bucket, path)
            raise
        lama = row.get("bukti_path")
        if lama and lama != path:
            await remove_object_quietly(self._db, self._bucket, lama)

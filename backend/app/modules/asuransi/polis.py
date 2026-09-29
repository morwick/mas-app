"""Polis asuransi unit / unit trailer.

Dipakai dari dua tempat:
  * halaman detail aset — tambah / perpanjang / ubah / hapus polis sendiri;
  * form tambah / edit unit & unit trailer — polis terkini ikut tersimpan
    dalam transaksi yang sama dengan data asetnya (`siapkan()`).
Dokumen polis (PDF / foto) disimpan lewat `PerubahanDokumen` (jenis "polis").
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Literal

from supabase import AsyncClient

from app.core.dokumen import BerkasUnggah, PerubahanDokumen, signed_url_dokumen
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.pg import num_or_none, rows, single
from app.core.timeutil import today_wib
from app.core.transaksi import Transaksi
from app.modules.asuransi.schemas import PolisAsuransi, PolisBaruInput, PolisInput
from app.modules.asuransi.service import pic_urut

JenisAset = Literal["unit", "unit_trailer"]

# Hint relasi eksplisit: perintah_kerja juga menunjuk polis & aset, jadi
# PostgREST bisa menganggapnya tabel penghubung.
_SELECT = (
    "*, asuransi:asuransi!polis_asuransi_asuransi_id_fkey(nama, pic:asuransi_pic(*)),"
    " unit:units!polis_asuransi_unit_id_fkey(kode_unit),"
    " trailer:unit_trailer!polis_asuransi_unit_trailer_id_fkey(kode_trailer)"
)


def kolom_aset(jenis: JenisAset) -> str:
    return "unit_id" if jenis == "unit" else "unit_trailer_id"


def _keadaan(mulai: str, berakhir: str, hari_ini: date) -> tuple[Literal["berlaku", "akan_datang", "berakhir"], int]:
    m, b = date.fromisoformat(mulai[:10]), date.fromisoformat(berakhir[:10])
    sisa = (b - hari_ini).days
    if hari_ini < m:
        return "akan_datang", sisa
    if hari_ini > b:
        return "berakhir", sisa
    return "berlaku", sisa


class PolisService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    def _query(self) -> Any:
        return self._db.table("polis_asuransi").select(_SELECT).eq("asuransi.pic.status", 1)

    async def _to_polis(self, r: dict[str, Any], *, with_url: bool = True) -> PolisAsuransi:
        asuransi = r.get("asuransi") or {}
        pic = pic_urut(asuransi.get("pic"))
        keadaan, sisa = _keadaan(r["mulai"], r["berakhir"], today_wib())
        return PolisAsuransi(
            id=r["id"],
            asuransi_id=r["asuransi_id"],
            asuransi_nama=asuransi.get("nama"),
            unit_id=r.get("unit_id"),
            unit_trailer_id=r.get("unit_trailer_id"),
            kode_aset=(r.get("unit") or {}).get("kode_unit") or (r.get("trailer") or {}).get("kode_trailer"),
            nomor_polis=r["nomor_polis"],
            jenis_pertanggungan=r["jenis_pertanggungan"],
            mulai=r["mulai"],
            berakhir=r["berakhir"],
            nilai_pertanggungan=num_or_none(r.get("nilai_pertanggungan")),
            own_risk=num_or_none(r.get("own_risk")),
            premi=num_or_none(r.get("premi")),
            catatan=r.get("catatan"),
            polis_uploaded_at=r.get("polis_uploaded_at"),
            polis_url=await signed_url_dokumen(self._db, r.get("polis_path")) if with_url else None,
            keadaan=keadaan,
            sisa_hari=sisa,
            pic_utama=next((p for p in pic if p.is_utama), pic[0] if pic else None),
        )

    # ── Baca ────────────────────────────────────────────────────────────────

    async def get(self, polis_id: str) -> PolisAsuransi:
        row = single(await self._query().eq("id", polis_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Polis asuransi tidak ditemukan")
        return await self._to_polis(row)

    async def riwayat(self, jenis: JenisAset, asset_id: str) -> list[PolisAsuransi]:
        """Semua polis aset, terbaru (mulai paling akhir) dulu."""
        res = await self._query().eq(kolom_aset(jenis), asset_id).order("mulai", desc=True).execute()
        return [await self._to_polis(r) for r in rows(res)]

    async def terkini(self, jenis: JenisAset, asset_id: str) -> PolisAsuransi | None:
        """Polis yang berlaku hari ini; bila tidak ada, polis dengan mulai paling akhir."""
        semua = await self.riwayat(jenis, asset_id)
        return next((p for p in semua if p.keadaan == "berlaku"), semua[0] if semua else None)

    async def berlaku_pada(self, jenis: JenisAset, asset_id: str, tanggal: date) -> PolisAsuransi | None:
        tgl = tanggal.isoformat()
        res = await (
            self._query().eq(kolom_aset(jenis), asset_id).lte("mulai", tgl).gte("berakhir", tgl).limit(1).execute()
        )
        data = rows(res)
        return await self._to_polis(data[0]) if data else None

    async def list_by_asuransi(self, asuransi_id: str) -> list[PolisAsuransi]:
        res = await self._query().eq("asuransi_id", asuransi_id).order("berakhir", desc=True).execute()
        return [await self._to_polis(r, with_url=False) for r in rows(res)]

    # ── Tulis ───────────────────────────────────────────────────────────────

    @staticmethod
    def _data(payload: PolisInput) -> dict[str, Any]:
        return {
            "asuransi_id": payload.asuransi_id,
            "nomor_polis": payload.nomor_polis,
            "jenis_pertanggungan": payload.jenis_pertanggungan,
            "mulai": payload.mulai.isoformat(),
            "berakhir": payload.berakhir.isoformat(),
            "nilai_pertanggungan": payload.nilai_pertanggungan,
            "own_risk": payload.own_risk,
            "premi": payload.premi,
            "catatan": payload.catatan,
        }

    async def _cek_asuransi(self, asuransi_id: str) -> None:
        row = single(
            await self._db.table("asuransi").select("id, is_active").eq("id", asuransi_id).maybe_single().execute()
        )
        if row is None:
            raise ValidationError("Asuransi tidak ditemukan")
        if not row.get("is_active", True):
            raise ValidationError("Asuransi yang dipilih sudah nonaktif")

    async def siapkan(
        self,
        tx: Transaksi,
        *,
        jenis: JenisAset,
        asset_id: str,
        payload: PolisInput,
        dokumen: BerkasUnggah | None,
        polis_id: str | None = None,
    ) -> PerubahanDokumen:
        """Tambahkan simpan polis ke `tx`. File diunggah lebih dulu; pemanggil
        wajib `batalkan()` bila transaksi gagal dan `selesaikan()` bila berhasil."""
        await self._cek_asuransi(payload.asuransi_id)
        lama_path: str | None = None
        if polis_id:
            lama = single(
                await self._db.table("polis_asuransi")
                .select("id, polis_path, unit_id, unit_trailer_id")
                .eq("id", polis_id)
                .maybe_single()
                .execute()
            )
            if lama is None or lama.get(kolom_aset(jenis)) != asset_id:
                raise NotFoundError("Polis asuransi tidak ditemukan")
            lama_path = lama.get("polis_path")
        target_id = polis_id or str(uuid.uuid4())
        perubahan = PerubahanDokumen(self._db, "polis", target_id)
        data = self._data(payload)
        data.update(await perubahan.siapkan("polis", dokumen, hapus=payload.hapus_dokumen_polis, lama=lama_path))
        if polis_id:
            tx.update("polis_asuransi", data, {"id": polis_id})
        else:
            tx.insert("polis_asuransi", {"id": target_id, kolom_aset(jenis): asset_id, **data})
        return perubahan

    async def _jalankan(self, tx: Transaksi, perubahan: PerubahanDokumen) -> None:
        try:
            await tx.jalankan()
        except Exception:
            await perubahan.batalkan()
            raise
        await perubahan.selesaikan()

    async def create(self, payload: PolisBaruInput, dokumen: BerkasUnggah | None) -> PolisAsuransi:
        jenis: JenisAset = "unit" if payload.unit_id else "unit_trailer"
        asset_id = payload.unit_id or payload.unit_trailer_id or ""
        tx = Transaksi(self._db)
        perubahan = await self.siapkan(tx, jenis=jenis, asset_id=asset_id, payload=payload, dokumen=dokumen)
        await self._jalankan(tx, perubahan)
        return (await self.riwayat(jenis, asset_id))[0]

    async def update(self, polis_id: str, payload: PolisInput, dokumen: BerkasUnggah | None) -> None:
        lama = await self.get(polis_id)
        jenis: JenisAset = "unit" if lama.unit_id else "unit_trailer"
        asset_id = lama.unit_id or lama.unit_trailer_id or ""
        tx = Transaksi(self._db)
        perubahan = await self.siapkan(
            tx, jenis=jenis, asset_id=asset_id, payload=payload, dokumen=dokumen, polis_id=polis_id
        )
        await self._jalankan(tx, perubahan)

    async def delete(self, polis_id: str) -> None:
        dipakai = await self._db.table("perintah_kerja").select("id").eq("polis_id", polis_id).limit(1).execute()
        if rows(dipakai):
            raise ConflictError("Polis ini sudah dipakai di perintah kerja, jadi tidak bisa dihapus.")
        res = await self._db.table("polis_asuransi").delete().eq("id", polis_id).execute()
        if not rows(res):
            raise NotFoundError("Polis asuransi tidak ditemukan")

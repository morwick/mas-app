"""Master Asuransi: perusahaan asuransi + PIC + bengkel rekanan.

Simpan = satu `Transaksi` (induk + PIC + bengkel rekanan sekaligus). Hapus =
soft delete; asuransi yang sudah dipakai polis ditolak database — nonaktifkan.
"""

from __future__ import annotations

import uuid
from typing import Any

from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import ConflictError, NotFoundError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import rows, single
from app.core.sinkron_anak import sinkron_anak
from app.core.timeutil import today_wib
from app.core.transaksi import Transaksi
from app.modules.asuransi.schemas import Asuransi, AsuransiInput, AsuransiPic, BengkelRekanan

_SELECT = "*, pic:asuransi_pic(*), bengkel_rekanan:asuransi_bengkel_rekanan(*)"
_DUPLIKAT = "Asuransi dengan nama ini sudah ada"


def _aktif_anak(query: Any) -> Any:
    return query.eq("pic.status", 1).eq("bengkel_rekanan.status", 1)


def to_pic(r: dict[str, Any]) -> AsuransiPic:
    return AsuransiPic(
        id=r["id"],
        sapaan=r.get("sapaan"),
        nama=r["nama"],
        jabatan=r.get("jabatan"),
        no_hp=r["no_hp"],
        email=r.get("email"),
        is_utama=bool(r.get("is_utama")),
    )


def pic_urut(data: list[dict[str, Any]] | None) -> list[AsuransiPic]:
    """PIC utama dulu, lalu sesuai urutan input."""
    daftar = sorted(data or [], key=lambda r: (not r.get("is_utama"), r.get("urutan") or 0, r.get("nama") or ""))
    return [to_pic(r) for r in daftar if r.get("status", 1) == 1]


def _to_asuransi(r: dict[str, Any], jumlah_aset: int = 0) -> Asuransi:
    pic = pic_urut(r.get("pic"))
    bengkel = sorted(r.get("bengkel_rekanan") or [], key=lambda b: (b.get("urutan") or 0, b.get("nama") or ""))
    return Asuransi(
        id=r["id"],
        nama=r["nama"],
        alamat=r.get("alamat"),
        telepon=r.get("telepon"),
        email=r.get("email"),
        catatan=r.get("catatan"),
        is_active=bool(r.get("is_active", True)),
        pic=pic,
        bengkel_rekanan=[
            BengkelRekanan(id=b["id"], nama=b["nama"], alamat=b.get("alamat"), kontak=b.get("kontak"))
            for b in bengkel
            if b.get("status", 1) == 1
        ],
        pic_utama=next((p for p in pic if p.is_utama), pic[0] if pic else None),
        jumlah_aset_aktif=jumlah_aset,
    )


class AsuransiService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def _jumlah_aset_aktif(self, ids: list[str] | None = None) -> dict[str, int]:
        hari_ini = today_wib().isoformat()
        q = (
            self._db.table("polis_asuransi")
            .select("asuransi_id, unit_id, unit_trailer_id")
            .lte("mulai", hari_ini)
            .gte("berakhir", hari_ini)
        )
        if ids:
            q = q.in_("asuransi_id", ids)
        out: dict[str, set[str]] = {}
        for r in rows(await q.execute()):
            out.setdefault(r["asuransi_id"], set()).add(str(r.get("unit_id") or r.get("unit_trailer_id")))
        return {k: len(v) for k, v in out.items()}

    async def _cari_ids_pic(self, q: str) -> list[str]:
        res = await self._db.table("asuransi_pic").select("asuransi_id").or_(ilike_any(["nama", "no_hp"], q)).execute()
        return sorted({r["asuransi_id"] for r in rows(res)})

    async def _filter(self, query: Any, *, q: str | None, aktif: bool | None) -> Any:
        if aktif is not None:
            query = query.eq("is_active", aktif)
        if q and q.strip():
            syarat = ilike_any(["nama", "telepon", "email"], q)
            ids = await self._cari_ids_pic(q)
            if ids:
                syarat += f",id.in.({','.join(ids)})"
            query = query.or_(syarat)
        return query

    async def list_page(self, *, params: PageParams, q: str | None = None, aktif: bool | None = None) -> Page[Asuransi]:
        query = _aktif_anak(self._db.table("asuransi").select(_SELECT, count=CountMethod.exact))
        query = await self._filter(query, q=q, aktif=aktif)
        res = await apply_window(query.order("nama").order("id"), params).execute()
        data = rows(res)
        jumlah = await self._jumlah_aset_aktif([r["id"] for r in data]) if data else {}
        return build_page([_to_asuransi(r, jumlah.get(r["id"], 0)) for r in data], res.count, params)

    async def counts(self, *, q: str | None = None) -> dict[str, int]:
        out: dict[str, int] = {}
        for key, flag in (("active", True), ("inactive", False)):
            query = self._db.table("asuransi").select("id", count=CountMethod.exact, head=True)
            query = await self._filter(query, q=q, aktif=flag)
            out[key] = (await query.execute()).count or 0
        out["all"] = out["active"] + out["inactive"]
        return out

    async def list_all(self, *, include_inactive: bool = False) -> list[Asuransi]:
        """Tanpa potongan — untuk dropdown asuransi di form polis."""
        query = _aktif_anak(self._db.table("asuransi").select(_SELECT)).order("nama")
        if not include_inactive:
            query = query.eq("is_active", True)
        return [_to_asuransi(r) for r in rows(await query.execute())]

    async def get(self, asuransi_id: str) -> Asuransi:
        row = single(
            await _aktif_anak(self._db.table("asuransi").select(_SELECT)).eq("id", asuransi_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Asuransi tidak ditemukan")
        jumlah = await self._jumlah_aset_aktif([asuransi_id])
        return _to_asuransi(row, jumlah.get(asuransi_id, 0))

    async def _pastikan_nama_unik(self, nama: str, kecuali_id: str | None = None) -> None:
        res = await self._db.table("asuransi").select("id, nama").execute()
        kunci = nama.casefold()
        for r in rows(res):
            if r["id"] != kecuali_id and " ".join(str(r.get("nama") or "").split()).casefold() == kunci:
                raise ConflictError(_DUPLIKAT)

    @staticmethod
    def _header(payload: AsuransiInput) -> dict[str, Any]:
        return {
            "nama": payload.nama,
            "alamat": payload.alamat,
            "telepon": payload.telepon,
            "email": payload.email,
            "catatan": payload.catatan,
        }

    @staticmethod
    def _anak(payload: AsuransiInput) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        pic = [
            {
                "id": p.id,
                "sapaan": p.sapaan,
                "nama": p.nama,
                "jabatan": p.jabatan,
                "no_hp": p.no_hp,
                "email": p.email,
                "is_utama": p.is_utama,
                "urutan": i,
            }
            for i, p in enumerate(payload.pic)
        ]
        bengkel = [
            {"id": b.id, "nama": b.nama, "alamat": b.alamat, "kontak": b.kontak, "urutan": i}
            for i, b in enumerate(payload.bengkel_rekanan)
        ]
        return pic, bengkel

    async def _jalankan(self, tx: Transaksi) -> None:
        try:
            await tx.jalankan()
        except APIError as exc:
            if exc.code == "23505" and "asuransi_nama_unique" in (exc.message or ""):
                raise ConflictError(_DUPLIKAT) from exc
            raise

    async def create(self, payload: AsuransiInput) -> Asuransi:
        await self._pastikan_nama_unik(payload.nama)
        asuransi_id = str(uuid.uuid4())
        pic, bengkel = self._anak(payload)
        tx = Transaksi(self._db)
        tx.insert("asuransi", {"id": asuransi_id, **self._header(payload)})
        sinkron_anak(tx, "asuransi_pic", "asuransi_id", asuransi_id, set(), pic)
        sinkron_anak(tx, "asuransi_bengkel_rekanan", "asuransi_id", asuransi_id, set(), bengkel)
        await self._jalankan(tx)
        return await self.get(asuransi_id)

    async def update(self, asuransi_id: str, payload: AsuransiInput) -> None:
        lama = await self.get(asuransi_id)
        await self._pastikan_nama_unik(payload.nama, kecuali_id=asuransi_id)
        pic, bengkel = self._anak(payload)
        tx = Transaksi(self._db)
        tx.update("asuransi", self._header(payload), {"id": asuransi_id})
        sinkron_anak(
            tx, "asuransi_pic", "asuransi_id", asuransi_id, {p.id for p in lama.pic}, pic, reset={"is_utama": False}
        )
        sinkron_anak(
            tx, "asuransi_bengkel_rekanan", "asuransi_id", asuransi_id, {b.id for b in lama.bengkel_rekanan}, bengkel
        )
        await self._jalankan(tx)

    async def set_active(self, asuransi_id: str, aktif: bool) -> None:
        res = await self._db.table("asuransi").update({"is_active": aktif}).eq("id", asuransi_id).execute()
        if not rows(res):
            raise NotFoundError("Asuransi tidak ditemukan")

    async def delete(self, asuransi_id: str) -> None:
        """Soft delete. Asuransi yang pernah dipakai polis ditolak database."""
        dipakai = await (
            self._db.table("polis_asuransi")
            .select("id", count=CountMethod.exact, head=True)
            .eq("asuransi_id", asuransi_id)
            .execute()
        )
        if dipakai.count:
            raise ConflictError(
                "Asuransi ini sudah dipakai di polis unit / unit trailer, jadi tidak bisa dihapus. Nonaktifkan saja."
            )
        res = await self._db.table("asuransi").delete().eq("id", asuransi_id).execute()
        if not rows(res):
            raise NotFoundError("Asuransi tidak ditemukan")

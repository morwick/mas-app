"""Hapus aset tanpa riwayat / baca ringkasan riwayat (migration 20260926000010).

Aset tanpa riwayat job, insiden, service, penjualan, dan penghapusan boleh
dihapus (hilang dari aplikasi seakan tidak pernah ada). Yang sudah punya
riwayat hanya bisa dinonaktifkan — fungsi DB menolaknya.
"""

from __future__ import annotations

from supabase import AsyncClient

from app.core.pg import rows
from app.modules.penjualan_unit.aset import JenisAset
from app.modules.units.schemas import RiwayatAset

_JENIS_RIWAYAT = ("job", "insiden", "service", "penjualan", "penghapusan")


async def ringkasan_riwayat(db: AsyncClient, jenis: JenisAset, asset_id: str) -> RiwayatAset:
    res = await db.rpc("ringkasan_riwayat_aset", {"p_jenis_aset": jenis, "p_asset_id": asset_id}).execute()
    data = (rows(res) or [{}])[0]
    jumlah = {k: int(data.get(k) or 0) for k in _JENIS_RIWAYAT}
    return RiwayatAset(**jumlah, bisa_dihapus=not any(jumlah.values()))


async def hapus_aset(db: AsyncClient, jenis: JenisAset, asset_id: str) -> None:
    await db.rpc("hapus_aset", {"p_jenis_aset": jenis, "p_asset_id": asset_id}).execute()

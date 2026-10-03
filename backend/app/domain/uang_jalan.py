"""Ringkasan uang jalan — dihitung dari riwayat, tidak pernah disimpan.

Uang jalan job = uang jalan awal (ditetapkan saat job dibuat) + tambahan yang
SUDAH DISETUJUI approver (migration 20261001000010). Tambahan yang masih
menunggu dicatat terpisah di `tambahan_menunggu` dan belum boleh dipakai.
Sisa = uang jalan job − yang sudah diberikan (cair) ke driver.

Cair dihitung BERSIH: pencairan − pengembalian. Pengembalian dicatat saat ganti
driver / ganti unit (migration 20261001000014) — uang itu kembali ke kas, jadi
bukan biaya job dan menambah sisa kembali.

BATASAN: kasbon supir TIDAK mengurangi cair (migration 20261001000017) — uangnya
sudah keluar untuk job ini; kasbon hanya mencatat utang supir lama.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel

# pencairan = uang diberikan ke driver; tambahan = kesepakatan menambah uang jalan job;
# pengembalian = uang dikembalikan supir lama ke kas; kasbon = sisa uang di supir
# lama yang dijadikan kasbon. Dua terakhir hanya dicatat lewat penggantian job.
UangJalanJenis = Literal["pencairan", "tambahan", "pengembalian", "kasbon"]
# Jenis yang boleh dicatat langsung dari form uang jalan.
UangJalanJenisInput = Literal["pencairan", "tambahan"]


def efek_cair(jenis: str | None, jumlah: float) -> float:
    """Pengaruh satu transaksi terhadap uang jalan yang sudah cair (bersih)."""
    if jenis == "pencairan":
        return jumlah
    if jenis == "pengembalian":
        return -jumlah
    # tambahan & kasbon tidak mengubah uang yang sudah diberikan.
    return 0.0


class UangJalanRingkasan(BaseModel):
    uang_jalan_awal: float
    tambahan: float
    # uang_jalan_awal + tambahan
    uang_jalan: float
    cair: float
    sisa: float
    persen_cair: int
    # Tambahan yang masih menunggu approval — belum masuk uang_jalan.
    tambahan_menunggu: float = 0


class _Transaksi(BaseModel):
    jenis: UangJalanJenis
    jumlah: float
    status_approval: str = "disetujui"


# Nama publik untuk modul lain yang menyusun transaksi sendiri (mis. detail proyek).
TransaksiRingkas = _Transaksi


def hitung_ringkasan(uang_jalan_awal: float, transaksi: Iterable[_Transaksi]) -> UangJalanRingkasan:
    tambahan = 0.0
    tambahan_menunggu = 0.0
    cair = 0.0
    for t in transaksi:
        if t.jenis != "tambahan":
            cair += efek_cair(t.jenis, t.jumlah)
        elif t.status_approval == "disetujui":
            tambahan += t.jumlah
        elif t.status_approval == "menunggu":
            tambahan_menunggu += t.jumlah
        # tambahan yang ditolak tidak dihitung sama sekali
    uang_jalan = uang_jalan_awal + tambahan
    return UangJalanRingkasan(
        uang_jalan_awal=uang_jalan_awal,
        tambahan=tambahan,
        uang_jalan=uang_jalan,
        cair=cair,
        sisa=uang_jalan - cair,
        persen_cair=round(cair / uang_jalan * 100) if uang_jalan > 0 else 0,
        tambahan_menunggu=tambahan_menunggu,
    )

"""Ringkasan uang jalan — dihitung dari riwayat, tidak pernah disimpan.

Uang jalan job = uang jalan awal (ditetapkan saat job dibuat) + tambahan.
Sisa = uang jalan job − yang sudah diberikan (cair) ke driver.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel

# pencairan = uang diberikan ke driver; tambahan = kesepakatan menambah uang jalan job.
UangJalanJenis = Literal["pencairan", "tambahan"]


class UangJalanRingkasan(BaseModel):
    uang_jalan_awal: float
    tambahan: float
    # uang_jalan_awal + tambahan
    uang_jalan: float
    cair: float
    sisa: float
    persen_cair: int


class _Transaksi(BaseModel):
    jenis: UangJalanJenis
    jumlah: float


def hitung_ringkasan(uang_jalan_awal: float, transaksi: Iterable[_Transaksi]) -> UangJalanRingkasan:
    tambahan = 0.0
    cair = 0.0
    for t in transaksi:
        if t.jenis == "tambahan":
            tambahan += t.jumlah
        else:
            cair += t.jumlah
    uang_jalan = uang_jalan_awal + tambahan
    return UangJalanRingkasan(
        uang_jalan_awal=uang_jalan_awal,
        tambahan=tambahan,
        uang_jalan=uang_jalan,
        cair=cair,
        sisa=uang_jalan - cair,
        persen_cair=round(cair / uang_jalan * 100) if uang_jalan > 0 else 0,
    )

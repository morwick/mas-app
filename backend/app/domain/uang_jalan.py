"""Ringkasan uang jalan — dihitung dari riwayat, tidak pernah disimpan."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from pydantic import BaseModel

UangJalanJenis = Literal["pencairan", "penambahan_pagu"]


class UangJalanRingkasan(BaseModel):
    pagu_awal: float
    penambahan: float
    pagu: float
    cair: float
    sisa: float
    persen_cair: int


class _Transaksi(BaseModel):
    jenis: UangJalanJenis
    jumlah: float


def hitung_ringkasan(pagu_awal: float, transaksi: Iterable[_Transaksi]) -> UangJalanRingkasan:
    penambahan = 0.0
    cair = 0.0
    for t in transaksi:
        if t.jenis == "penambahan_pagu":
            penambahan += t.jumlah
        else:
            cair += t.jumlah
    pagu = pagu_awal + penambahan
    return UangJalanRingkasan(
        pagu_awal=pagu_awal,
        penambahan=penambahan,
        pagu=pagu,
        cair=cair,
        sisa=pagu - cair,
        persen_cair=round(cair / pagu * 100) if pagu > 0 else 0,
    )

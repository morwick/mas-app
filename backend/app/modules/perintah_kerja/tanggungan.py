"""Siapa menanggung biaya perbaikan: asuransi atau perusahaan.

Aturan (klaim asuransi kendaraan umumnya):
  * Pelaksana bukan asuransi / belum ada klaim → seluruhnya perusahaan.
  * Klaim ditolak → seluruhnya perusahaan.
  * Klaim disetujui / dibayar → asuransi menanggung `nilai disetujui − own risk`
    (tidak lebih dari total biaya); perusahaan menanggung sisanya (own risk +
    selisih yang tidak disetujui).
  * Klaim masih diajukan / survei → sama seperti di atas memakai nilai yang
    diajukan (atau total biaya bila belum diisi), ditandai *estimasi*.
"""

from __future__ import annotations

from pydantic import BaseModel


class Tanggungan(BaseModel):
    total: float
    asuransi: float
    perusahaan: float
    own_risk: float = 0
    estimasi: bool = False


def _uang(x: float) -> float:
    return round(max(x, 0.0), 2)


def hitung_tanggungan(
    total: float,
    *,
    pelaksana: str,
    status_klaim: str | None = None,
    nilai_diajukan: float | None = None,
    nilai_disetujui: float | None = None,
    own_risk: float | None = None,
) -> Tanggungan:
    total = _uang(total)
    orisk = _uang(own_risk or 0)
    if pelaksana != "asuransi" or status_klaim is None or status_klaim == "ditolak":
        return Tanggungan(total=total, asuransi=0, perusahaan=total, own_risk=0 if status_klaim is None else orisk)
    if status_klaim in ("disetujui", "dibayar"):
        dasar, estimasi = (nilai_disetujui or 0), False
    else:
        dasar, estimasi = (nilai_diajukan if nilai_diajukan is not None else total), True
    asuransi = _uang(min(dasar, total) - orisk)
    return Tanggungan(
        total=total, asuransi=asuransi, perusahaan=_uang(total - asuransi), own_risk=orisk, estimasi=estimasi
    )

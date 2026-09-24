"""Nominal uang jalan yang masuk database wajib bilangan bulat.

Kolomnya BIGINT (`uang_jalan.jumlah`, `jobs.uang_jalan_pagu`). Pecahan yang
lolos sampai Postgres akan dibulatkan diam-diam, sehingga angka tersimpan
berbeda dari yang dikirim tanpa ada yang tahu — jadi ditolak di pintu masuk.
"""

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.modules.uang_jalan.schemas import DriverRequestInput, SetPaguRequest, UangJalanInput
from app.modules.uang_jalan.service import _clean, _validate

BASE = {"job_id": "job-1", "jenis": "pencairan", "tanggal": "2026-09-23", "sumber_dana_id": "kas-1"}


def test_rupiah_bulat_diterima_apa_adanya() -> None:
    payload = UangJalanInput(**BASE, jumlah=2_500_000)
    assert payload.jumlah == 2_500_000
    assert _clean(payload)["jumlah"] == 2_500_000
    assert isinstance(_clean(payload)["jumlah"], int)


def test_pecahan_ditolak_bukan_dibulatkan_diam_diam() -> None:
    with pytest.raises(PydanticValidationError):
        UangJalanInput(**BASE, jumlah=2_500_000.75)


def test_float_tanpa_pecahan_tetap_lolos_sebagai_int() -> None:
    # JSON tidak membedakan 2500000 dan 2500000.0; yang kedua tetap bulat.
    payload = UangJalanInput(**BASE, jumlah=2_500_000.0)
    assert payload.jumlah == 2_500_000
    assert isinstance(payload.jumlah, int)


def test_teks_bermask_ditolak() -> None:
    # Frontend mengirim digit polos; "Rp 2.500.000" berarti ada yang salah.
    with pytest.raises(PydanticValidationError):
        UangJalanInput(**BASE, jumlah="Rp 2.500.000")


def test_nol_dan_negatif_ditolak_dengan_pesan_indonesia() -> None:
    from app.core.errors import ValidationError

    for nilai in (0, -1_000):
        with pytest.raises(ValidationError, match="Jumlah harus lebih dari nol"):
            _validate(UangJalanInput(**BASE, jumlah=nilai))


def test_pagu_hanya_bilangan_bulat_tak_negatif() -> None:
    assert SetPaguRequest(pagu=0).pagu == 0
    assert SetPaguRequest(pagu=12_000_000).pagu == 12_000_000
    with pytest.raises(PydanticValidationError):
        SetPaguRequest(pagu=12_000_000.5)
    with pytest.raises(PydanticValidationError):
        SetPaguRequest(pagu=-1)


def test_pengajuan_driver_juga_bilangan_bulat() -> None:
    assert DriverRequestInput(nominal=1_500_000).nominal == 1_500_000
    with pytest.raises(PydanticValidationError):
        DriverRequestInput(nominal=1_500_000.5)

"""Tanggal-jam dari form (jam WIB, offset +07:00) tersimpan sebagai momen yang sama."""

from app.core.timeutil import parse_iso
from app.modules.jobs.service import _derive_eta, _reject_back_dated_etd, _to_iso


def test_etd_wib_disimpan_momen_yang_sama() -> None:
    # Form mengirim 26 Sep 06:30 WIB → tersimpan 25 Sep 23:30 UTC (momen sama).
    assert _to_iso("2026-09-26T06:30:00+07:00") == "2026-09-25T23:30:00.000Z"


def test_eta_turunan_tetap_momen_yang_sama() -> None:
    eta, estimasi = _derive_eta(etd="2026-09-26T06:30:00+07:00", eta=None, duration_min=90)
    assert estimasi is True
    assert parse_iso(eta) == parse_iso("2026-09-26T08:00:00+07:00")


def test_cek_tanggal_lewat_memakai_tanggal_wib_yang_dipilih() -> None:
    # Tanggal yang dibandingkan = tanggal yang dipilih admin (bagian tanggal string WIB),
    # bukan tanggal UTC-nya (yang di sini masih tanggal 25).
    _reject_back_dated_etd("2099-09-26T06:30:00+07:00")

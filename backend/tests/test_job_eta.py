"""Penurunan ETA: isian admin menang, kosong diisi dari durasi rute."""

from app.core.timeutil import parse_iso
from app.modules.jobs.service import _derive_eta

ETD = "2026-10-01T08:00"


def test_eta_isian_admin_dipakai_apa_adanya() -> None:
    eta, estimasi = _derive_eta(etd=ETD, eta="2026-10-01T17:30", duration_min=68)
    assert estimasi is False
    assert parse_iso(eta).hour == 17 and parse_iso(eta).minute == 30


def test_eta_kosong_diisi_dari_durasi_rute() -> None:
    eta, estimasi = _derive_eta(etd=ETD, eta=None, duration_min=68)
    assert estimasi is True
    selisih = (parse_iso(eta) - parse_iso(ETD)).total_seconds() / 60
    assert selisih == 68


def test_eta_string_kosong_diperlakukan_sama_dengan_none() -> None:
    # Form mengirim "" saat field dikosongkan, bukan null.
    assert _derive_eta(etd=ETD, eta="", duration_min=30)[1] is True
    assert _derive_eta(etd=ETD, eta="   ", duration_min=30)[1] is True


def test_tanpa_durasi_rute_eta_dibiarkan_kosong() -> None:
    """Koordinat belum dipin atau ORS gagal — lebih baik kosong daripada ditebak."""
    eta, estimasi = _derive_eta(etd=ETD, eta=None, duration_min=None)
    assert eta is None and estimasi is False


def test_durasi_nol_tetap_menghasilkan_eta() -> None:
    eta, estimasi = _derive_eta(etd=ETD, eta=None, duration_min=0)
    assert estimasi is True
    assert parse_iso(eta) == parse_iso(ETD)


def test_durasi_panjang_melewati_tengah_malam() -> None:
    eta, _ = _derive_eta(etd=ETD, eta=None, duration_min=20 * 60)
    d = parse_iso(eta)
    assert (d.day, d.hour) == (2, 4)


def test_eta_selalu_iso_utc() -> None:
    eta, _ = _derive_eta(etd=ETD, eta=None, duration_min=90)
    assert eta.endswith("Z")

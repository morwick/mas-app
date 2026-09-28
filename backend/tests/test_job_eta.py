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


def test_eta_kosong_dan_rute_tidak_terhitung_ditolak() -> None:
    """Rute gagal dihitung + ETA dikosongkan → job ditolak dengan pesan yang jelas."""
    import pytest

    from app.core.errors import ValidationError
    from app.modules.jobs.service import ETA_TIDAK_TERHITUNG_MESSAGE, _require_eta

    eta, _ = _derive_eta(etd=ETD, eta="", duration_min=None)
    with pytest.raises(ValidationError) as err:
        _require_eta(eta)
    assert err.value.message == ETA_TIDAK_TERHITUNG_MESSAGE


def test_eta_terisi_atau_terhitung_diterima() -> None:
    from app.modules.jobs.service import _require_eta

    _require_eta(_derive_eta(etd=ETD, eta="2026-10-01T17:30", duration_min=None)[0])
    _require_eta(_derive_eta(etd=ETD, eta=None, duration_min=90)[0])


def test_bentrok_jadwal_selalu_ditolak_dengan_pesan_jelas() -> None:
    """Tidak ada lagi opsi "tetap simpan": skema job tidak menerima allow_conflict."""
    from app.domain.job_conflicts import ConflictCheckResult
    from app.modules.jobs.schemas import JobCreate, JobUpdate
    from app.modules.jobs.service import BENTROK_JADWAL_MESSAGE, JobConflictError

    err = JobConflictError(ConflictCheckResult(unit=[], driver=[], has_any=True))
    assert err.status_code == 409
    assert err.message == "Gagal! Ada bentrok jadwal. Silakan dicek kembali."
    assert err.message == BENTROK_JADWAL_MESSAGE
    assert "allow_conflict" not in JobCreate.model_fields
    assert "allow_conflict" not in JobUpdate.model_fields

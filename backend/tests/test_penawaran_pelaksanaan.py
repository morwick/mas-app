"""Kolom Pelaksanaan daftar penawaran: informasi job."""

from app.modules.quotations.service import _job_pelaksanaan


def test_job_dibatalkan_dan_job_lama_yang_diganti_tidak_dihitung() -> None:
    jobs = [
        {"id": "j1", "status_job": "selesai", "quotation_item_id": "a"},  # unit rusak, diganti j2
        {"id": "j2", "status_job": "dalam_perjalanan", "quotation_item_id": "a", "menggantikan_job_id": "j1"},
        {"id": "j3", "status_job": "cancelled", "quotation_item_id": "b"},
        {"id": "j4", "status_job": "selesai", "quotation_item_id": "b"},
    ]
    assert [j["id"] for j in _job_pelaksanaan(jobs)] == ["j2", "j4"]

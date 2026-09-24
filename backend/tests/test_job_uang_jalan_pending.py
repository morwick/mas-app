"""Penanda "driver menunggu pencairan uang jalan" di daftar job.

Perjalanan driver terkunci sampai admin mengunggah bukti transfer (BR-02), jadi
pengajuan yang menggantung menahan job. Daftar job harus memperlihatkannya tanpa
admin perlu membuka halaman Uang Jalan satu per satu.
"""

from typing import Any

import pytest

from app.modules.jobs.mappers import DRIVER_JOB_SELECT, JOB_SELECT, PUBLIC_JOB_SELECT, to_job

BASE: dict[str, Any] = {
    "id": "job-1",
    "job_number": "JOB-2026-014",
    "share_token": "tok",
    "customer_id": "cust-1",
    "unit_id": "unit-1",
    "driver_id": "driver-1",
    "etd": "2026-09-23T10:00:00+00:00",
    "status_job": "diterima",
    "created_at": "2026-09-23T07:00:00+00:00",
    "alat_diangkut": "Excavator",
    "asal": "Gudang A",
    "tujuan": "Proyek B",
}


def job(requests: list[dict[str, Any]] | None) -> Any:
    return to_job({**BASE, "uang_jalan_requests": requests})


def test_pengajuan_menunggu_ditandai_beserta_nominalnya() -> None:
    j = job([{"status_pengajuan": "diajukan", "nominal": 1_000_000, "requested_at": "2026-09-23T07:09:52+00:00"}])
    assert j.uang_jalan_pending is True
    assert j.uang_jalan_pending_nominal == 1_000_000
    assert j.uang_jalan_pending_at == "2026-09-23T07:09:52+00:00"


@pytest.mark.parametrize("status", ["dicairkan", "ditolak"])
def test_pengajuan_yang_sudah_diputus_tidak_menandai_apa_pun(status: str) -> None:
    j = job([{"status_pengajuan": status, "nominal": 1_000_000, "requested_at": "2026-09-23T07:09:52+00:00"}])
    assert j.uang_jalan_pending is False
    assert j.uang_jalan_pending_nominal is None


def test_riwayat_panjang_hanya_memakai_yang_masih_menunggu() -> None:
    j = job(
        [
            {"status_pengajuan": "dicairkan", "nominal": 500_000, "requested_at": "2026-09-22T00:00:00+00:00"},
            {"status_pengajuan": "ditolak", "nominal": 900_000, "requested_at": "2026-09-22T06:00:00+00:00"},
            {"status_pengajuan": "diajukan", "nominal": 2_000_000, "requested_at": "2026-09-23T09:07:13+00:00"},
        ]
    )
    assert j.uang_jalan_pending is True
    assert j.uang_jalan_pending_nominal == 2_000_000


def test_tanpa_pengajuan_sama_sekali() -> None:
    assert job([]).uang_jalan_pending is False
    assert job(None).uang_jalan_pending is False


def test_payload_publik_dan_driver_tidak_membawa_kolomnya() -> None:
    # Nominal pengajuan adalah angka internal; pelanggan yang memegang tautan
    # lacak dan aplikasi driver tidak boleh menerimanya.
    assert "uang_jalan_requests" in JOB_SELECT
    assert "uang_jalan_requests" not in PUBLIC_JOB_SELECT
    assert "uang_jalan_requests" not in DRIVER_JOB_SELECT


# ── Uang jalan yang sudah cair (penentu boleh-tidaknya job dibatalkan) ──────


def job_uj(uang_jalan: list[dict[str, Any]] | None) -> Any:
    return to_job({**BASE, "uang_jalan": uang_jalan})


def test_pencairan_dijumlahkan() -> None:
    j = job_uj(
        [
            {"jenis": "pencairan", "jumlah": 1_000_000},
            {"jenis": "pencairan", "jumlah": 500_000},
        ]
    )
    assert j.uang_jalan_cair == 1_500_000


def test_penambahan_pagu_bukan_pencairan() -> None:
    # Menaikkan pagu tidak mengeluarkan uang, jadi job masih boleh dibatalkan.
    j = job_uj([{"jenis": "penambahan_pagu", "jumlah": 3_000_000}])
    assert j.uang_jalan_cair == 0


def test_tanpa_transaksi_uang_jalan() -> None:
    assert job_uj([]).uang_jalan_cair == 0
    assert job_uj(None).uang_jalan_cair == 0


def test_pengajuan_menunggu_tidak_menghitung_sebagai_cair() -> None:
    # Pengajuan belum mengeluarkan uang — pembatalan masih boleh.
    j = to_job(
        {
            **BASE,
            "uang_jalan_requests": [{"status_pengajuan": "diajukan", "nominal": 2_000_000, "requested_at": None}],
            "uang_jalan": [],
        }
    )
    assert j.uang_jalan_pending is True
    assert j.uang_jalan_cair == 0

"""Push FCM saat job berpindah driver.

Notifikasi in-app dibuat trigger database; push-nya dikirim dari sini supaya
driver tetap tahu meski aplikasinya tertutup.
"""

import asyncio
from typing import Any

import pytest

from app.modules.jobs.service import JobService

CURRENT = {
    "job_number": "JOB-2026-0031",
    "status_job": "ditugaskan",
    "driver_id": "driver-lama",
    "asal": "Gudang A",
    "tujuan": "Proyek B",
}


@pytest.fixture
def terkirim(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    keluar: list[dict[str, Any]] = []

    async def fake_push(driver_id: str, *, title: str, body: str, data: dict[str, str] | None = None):
        keluar.append({"driver_id": driver_id, "title": title, "body": body, "data": data or {}})

    monkeypatch.setattr("app.modules.jobs.service.push_to_driver", fake_push)
    return keluar


def jalankan(data: dict[str, Any], current: dict[str, Any] | None) -> None:
    svc = JobService.__new__(JobService)  # tanpa koneksi DB
    asyncio.run(svc._notify_driver_reassigned("job-1", data, current))


def test_driver_berganti_mengirim_ke_dua_pihak(terkirim: list[dict[str, Any]]) -> None:
    jalankan({"driver_id": "driver-baru"}, CURRENT)
    assert [x["driver_id"] for x in terkirim] == ["driver-baru", "driver-lama"]
    assert terkirim[0]["title"] == "Anda ditugaskan ke job"
    assert "JOB-2026-0031" in terkirim[0]["body"]
    assert "Gudang A → Proyek B" in terkirim[0]["body"]


def test_payload_membawa_job_id_untuk_membuka_detail(terkirim: list[dict[str, Any]]) -> None:
    # Aplikasi mobile memakai data['job_id'] untuk push ke /jobs/<id>.
    jalankan({"driver_id": "driver-baru"}, CURRENT)
    assert terkirim[0]["data"]["job_id"] == "job-1"
    assert terkirim[0]["data"]["kind"] == "job_baru"


def test_driver_sama_tidak_mengirim_apa_pun(terkirim: list[dict[str, Any]]) -> None:
    jalankan({"driver_id": "driver-lama"}, CURRENT)
    assert terkirim == []


def test_field_lain_berubah_tanpa_driver_tidak_mengirim(terkirim: list[dict[str, Any]]) -> None:
    jalankan({"catatan": "ubah catatan saja"}, CURRENT)
    assert terkirim == []


@pytest.mark.parametrize("status", ["selesai", "cancelled"])
def test_job_yang_sudah_usai_dilewati(terkirim: list[dict[str, Any]], status: str) -> None:
    jalankan({"driver_id": "driver-baru"}, {**CURRENT, "status_job": status})
    assert terkirim == []


def test_tanpa_driver_lama_hanya_memberi_tahu_yang_baru(terkirim: list[dict[str, Any]]) -> None:
    jalankan({"driver_id": "driver-baru"}, {**CURRENT, "driver_id": None})
    assert len(terkirim) == 1 and terkirim[0]["driver_id"] == "driver-baru"


def test_tanpa_data_lama_tidak_menebak(terkirim: list[dict[str, Any]]) -> None:
    jalankan({"driver_id": "driver-baru"}, None)
    assert terkirim == []

"""Pesan gagal untuk tambah/ubah/hapus data."""

import pytest
from fastapi.testclient import TestClient

from app.core.errors import awalan_gagal, pesan_gagal


@pytest.mark.parametrize(
    ("method", "path", "harapan"),
    [
        ("POST", "/api/customers", "Gagal menambah data"),
        ("POST", "/api/invoices/abc/payments", "Gagal menambah data"),
        ("POST", "/api/karyawan", "Gagal menambah data"),
        ("PATCH", "/api/customers/abc", "Gagal mengubah data"),
        ("PUT", "/api/invoices/abc", "Gagal mengubah data"),
        ("POST", "/api/jobs/abc/status", "Gagal mengubah data"),
        ("POST", "/api/jobs/abc/cancel", "Gagal mengubah data"),
        ("POST", "/api/users/abc/reset-password", "Gagal mengubah data"),
        ("DELETE", "/api/jenis-unit/abc", "Gagal menghapus data"),
        # bukan penyimpanan data
        ("GET", "/api/customers", None),
        ("POST", "/api/auth/login", None),
        ("POST", "/api/driver/login", None),
        ("POST", "/api/jobs/check-conflicts", None),
    ],
)
def test_awalan_sesuai_jenis_aksi(method: str, path: str, harapan: str | None) -> None:
    assert awalan_gagal(method, path) == harapan


def test_pesan_diberi_awalan() -> None:
    assert pesan_gagal("POST", "/api/customers", "Nama wajib diisi") == "Gagal menambah data. Nama wajib diisi"


def test_pesan_yang_sudah_menyebut_gagal_tidak_dobel() -> None:
    pesan = "Pengguna gagal ditambahkan karena email sudah terdaftar."
    assert pesan_gagal("POST", "/api/users", pesan) == pesan


def test_validasi_lewat_api_berupa_pesan_teks(client: TestClient) -> None:
    res = client.post("/api/driver/login", json={"no_hp": "0812", "pin": "12"})
    assert res.status_code == 422
    assert isinstance(res.json()["detail"], str)


def test_tulis_tanpa_login_ditolak_dengan_pesan_gagal(client: TestClient) -> None:
    res = client.post("/api/jenis-unit", json={"nama": "Lowbed"})
    assert res.status_code == 401
    assert res.json()["detail"].startswith("Gagal menambah data.")


def test_sesi_tidak_ditemukan_dijawab_401_supaya_login_lagi() -> None:
    from postgrest.exceptions import APIError

    from app.core.errors import _postgrest_status

    err = APIError(
        {"code": "28000", "message": "Sesi tidak ditemukan. Silakan login lagi.", "details": None, "hint": None}
    )
    assert _postgrest_status(err) == 401

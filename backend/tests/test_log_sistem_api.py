"""Endpoint daftar log sistem: filter diteruskan ke database, paging di server."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import superadmin_client
from app.main import app


class _FakeDb:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data
        self.panggilan: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_FakeDb":
        self.panggilan.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


BARIS = {
    "id": "l1",
    "waktu": "2026-09-24T08:00:00+07:00",
    "aksi": "Tambah Data",
    "keterangan": "Data Penawaran 0001/SK/MAS/IX/2026 (ID q1)",
    "ip_address": "203.0.113.7",
    "karyawan_id": "k1",
    "karyawan_nama": "Boss",
    "total": 42,
}


@pytest.fixture
def db() -> Iterator[_FakeDb]:
    fake = _FakeDb([BARIS])

    async def override() -> Any:
        yield fake

    app.dependency_overrides[superadmin_client] = override
    yield fake
    app.dependency_overrides.pop(superadmin_client, None)


def test_filter_dan_paging_diteruskan(client: TestClient, db: _FakeDb) -> None:
    res = client.get(
        "/api/log-sistem",
        params={
            "page": 3,
            "page_size": 20,
            "dari": "2026-09-01",
            "sampai": "2026-09-24",
            "karyawan_id": "k1",
            "aksi": "Hapus Data",
            "q": " penawaran ",
        },
    )
    assert res.status_code == 200
    nama, p = db.panggilan[0]
    assert nama == "daftar_log_sistem"
    assert p == {
        "p_dari": "2026-09-01",
        "p_sampai": "2026-09-24",
        "p_karyawan": "k1",
        "p_aksi": "Hapus Data",
        "p_cari": "penawaran",
        "p_limit": 20,
        "p_offset": 40,
    }
    body = res.json()
    assert body["total"] == 42
    assert body["items"][0]["karyawan_nama"] == "Boss"


def test_tanggal_terbalik_ditolak(client: TestClient, db: _FakeDb) -> None:
    res = client.get("/api/log-sistem", params={"dari": "2026-09-24", "sampai": "2026-09-01"})
    assert res.status_code == 422


def test_aksi_tidak_dikenal_ditolak(client: TestClient, db: _FakeDb) -> None:
    res = client.get("/api/log-sistem", params={"aksi": "Hapus Semua"})
    assert res.status_code == 422


def test_semua_memakai_pagar_yang_sama_dengan_daftar_lain(client: TestClient, db: _FakeDb) -> None:
    res = client.get("/api/log-sistem", params={"page_size": -1})
    assert res.status_code == 200
    p = db.panggilan[0][1]
    assert p["p_limit"] == 5000
    assert p["p_offset"] == 0


def test_default_10_baris(client: TestClient, db: _FakeDb) -> None:
    client.get("/api/log-sistem", params={"page_size": 10})
    assert db.panggilan[0][1]["p_limit"] == 10

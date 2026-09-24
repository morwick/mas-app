"""Menu Karyawan & driver yang dipilih dari karyawan."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import superadmin_client
from app.core.errors import ConflictError, ValidationError
from app.main import app
from app.modules.drivers.schemas import DriverCreate
from app.modules.drivers.service import DriverService


class _FakeDb:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.panggilan: list[tuple[str, dict[str, Any] | None]] = []
        self.insert_data: dict[str, Any] | None = None

    def rpc(self, nama: str, params: dict[str, Any] | None = None) -> "_FakeDb":
        self.panggilan.append((nama, params))
        return self

    def table(self, _nama: str) -> "_FakeDb":
        return self

    def insert(self, data: dict[str, Any]) -> "_FakeDb":
        self.insert_data = data
        self.data = [{**data, "id": "d-baru", "is_active": True, "created_at": "2026-09-24T00:00:00Z"}]
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


@pytest.fixture
def db() -> Iterator[_FakeDb]:
    fake = _FakeDb([])

    async def override() -> Any:
        yield fake

    app.dependency_overrides[superadmin_client] = override
    yield fake
    app.dependency_overrides.pop(superadmin_client, None)


def test_daftar_paging_cari_filter_diteruskan(client: TestClient, db: _FakeDb) -> None:
    db.data = [{"id": "k1", "nama": "Budi", "is_active": False, "akun": [], "driver": None, "total": 31}]
    res = client.get("/api/karyawan", params={"page": 2, "page_size": 10, "q": " bud ", "aktif": "nonaktif"})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 31 and body["items"][0]["nama"] == "Budi"
    assert db.panggilan == [("daftar_karyawan", {"p_q": "bud", "p_aktif": False, "p_limit": 10, "p_offset": 10})]


def test_tambah_ubah_hapus_lewat_fungsi_database(client: TestClient, db: _FakeDb) -> None:
    db.data = "k9"
    assert client.post("/api/karyawan", json={"nama": " Siti ", "is_active": True}).json() == {"id": "k9"}
    assert db.panggilan[-1] == (
        "simpan_karyawan",
        {"p_id": None, "p_nama": "Siti", "p_tanggal_lahir": None, "p_alamat": None, "p_is_active": True},
    )
    client.patch("/api/karyawan/k9", json={"nama": "Siti", "is_active": False})
    assert db.panggilan[-1][1]["p_id"] == "k9" and db.panggilan[-1][1]["p_is_active"] is False
    assert client.delete("/api/karyawan/k9").status_code == 200
    assert db.panggilan[-1] == ("hapus_karyawan", {"p_id": "k9"})


def test_tanggal_lahir_masa_depan_ditolak(client: TestClient, db: _FakeDb) -> None:
    res = client.post("/api/karyawan", json={"nama": "X", "tanggal_lahir": "2999-01-01"})
    assert res.status_code == 422
    assert db.panggilan == []


PILIHAN = [
    {"id": "k1", "nama": "Budi", "driver_id": None},
    {"id": "k2", "nama": "Andi", "driver_id": "d1"},
]


async def test_driver_baru_nama_dari_karyawan() -> None:
    fake = _FakeDb(PILIHAN)
    driver = await DriverService(fake).create(DriverCreate(karyawan_id="k1", no_hp="081234567890"))  # type: ignore[arg-type]
    assert fake.insert_data is not None
    assert fake.insert_data["karyawan_id"] == "k1" and fake.insert_data["nama"] == "Budi"
    assert driver.karyawan_id == "k1"


async def test_karyawan_yang_sudah_driver_ditolak() -> None:
    with pytest.raises(ConflictError, match="sudah terdaftar: Andi sudah menjadi driver"):
        await DriverService(_FakeDb(PILIHAN)).create(DriverCreate(karyawan_id="k2", no_hp="081234567890"))  # type: ignore[arg-type]


async def test_karyawan_nonaktif_ditolak() -> None:
    with pytest.raises(ValidationError, match="nonaktif"):
        await DriverService(_FakeDb(PILIHAN)).create(DriverCreate(karyawan_id="k-x", no_hp="081234567890"))  # type: ignore[arg-type]

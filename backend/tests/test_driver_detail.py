"""Detail driver: riwayat job per driver & dokumen SIM di form tambah/edit."""

import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import user_client
from app.main import app


class _Query:
    def __init__(self, db: "_FakeDb", tabel: str) -> None:
        self.db = db
        self.langkah: list[tuple[str, Any]] = [("table", tabel)]
        db.query.append(self.langkah)

    def __getattr__(self, nama: str) -> Any:
        def rekam(*args: Any, **kwargs: Any) -> "_Query":
            self.langkah.append((nama, args or kwargs))
            return self

        return rekam

    async def execute(self) -> SimpleNamespace:
        ops = [n for n, _ in self.langkah]
        if "insert" in ops:
            data = next(a for n, a in self.langkah if n == "insert")[0]
            return SimpleNamespace(data=[{"created_at": "2026-09-29T00:00:00Z", "is_active": True, **data}])
        if "update" in ops:
            return SimpleNamespace(data=[{}])
        if "maybe_single" in ops:
            return SimpleNamespace(data=self.db.driver)
        return SimpleNamespace(data=[])


class _FakeStorage:
    def __init__(self) -> None:
        self.diunggah: list[str] = []
        self.dihapus: list[str] = []

    def from_(self, bucket: str) -> "_FakeStorage":
        assert bucket == "dokumen-master"
        return self

    async def upload(self, path: str, data: bytes, opsi: dict[str, str]) -> None:
        self.diunggah.append(path)

    async def remove(self, paths: list[str]) -> None:
        self.dihapus.extend(paths)


class _Rpc:
    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[{"id": "k1", "nama": "Budi", "driver_id": None}])


class _FakeDb:
    def __init__(self) -> None:
        self.query: list[list[tuple[str, Any]]] = []
        self.storage = _FakeStorage()
        self.driver: dict[str, Any] = {"id": "d1", "karyawan_id": "k1", "sim_path": None}

    def table(self, nama: str) -> _Query:
        return _Query(self, nama)

    def rpc(self, nama: str, params: dict[str, Any] | None = None) -> _Rpc:
        return _Rpc()


@pytest.fixture
def db() -> Iterator[_FakeDb]:
    fake = _FakeDb()

    async def override() -> Any:
        yield fake

    app.dependency_overrides[user_client] = override
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_riwayat_job_difilter_per_driver(client: TestClient, db: _FakeDb) -> None:
    res = client.get("/api/drivers/d1/jobs")
    assert res.status_code == 200
    assert res.json() == []
    langkah = db.query[0]
    assert langkah[0] == ("table", "jobs")
    assert ("eq", ("driver_id", "d1")) in langkah


def test_tambah_driver_dengan_dokumen_sim(client: TestClient, db: _FakeDb) -> None:
    res = client.post(
        "/api/drivers",
        data={"data": json.dumps({"karyawan_id": "k1", "no_hp": "081234567890"})},
        files={"dokumen_sim": ("sim.jpg", b"jpg", "image/jpeg")},
    )
    assert res.status_code == 201
    insert = next(a for q in db.query for n, a in q if n == "insert")[0]
    assert insert["sim_path"].startswith(f"drivers/{insert['id']}/sim-")
    assert db.storage.diunggah == [insert["sim_path"]]


def test_tambah_driver_tanpa_dokumen(client: TestClient, db: _FakeDb) -> None:
    res = client.post("/api/drivers", data={"data": json.dumps({"karyawan_id": "k1", "no_hp": "081234567890"})})
    assert res.status_code == 201
    insert = next(a for q in db.query for n, a in q if n == "insert")[0]
    assert "sim_path" not in insert
    assert db.storage.diunggah == []


def test_isian_tidak_valid_422(client: TestClient, db: _FakeDb) -> None:
    res = client.post("/api/drivers", data={"data": json.dumps({"karyawan_id": "k1", "no_hp": "123"})})
    assert res.status_code == 422
    assert not any(n == "insert" for q in db.query for n, _ in q)


def test_hapus_dokumen_sim(client: TestClient, db: _FakeDb) -> None:
    db.driver = {"id": "d1", "karyawan_id": "k1", "sim_path": "drivers/d1/sim-lama.pdf"}
    res = client.patch("/api/drivers/d1", data={"data": json.dumps({"hapus_dokumen_sim": True})})
    assert res.status_code == 200
    update = next(a for q in db.query for n, a in q if n == "update")[0]
    assert update == {"sim_path": None, "sim_uploaded_at": None}
    assert db.storage.dihapus == ["drivers/d1/sim-lama.pdf"]

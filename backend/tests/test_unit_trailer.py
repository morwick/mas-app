"""Master Unit Trailer: paging & filter di server, duplikat ditolak, hapus = soft delete."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.main import app

BARIS = {
    "id": "t1",
    "kode_trailer": "TR-01",
    "tahun": 2020,
    "jenis_unit_trailer_id": "j1",
    "kapasitas_ton": "40.00",
    "status_trailer": "standby",
    "jenis": {"nama": "Lowbed 3 as", "jenis_unit": {"nama": "Lowbed"}},
}


class _Query:
    """Merekam rantai query PostgREST yang dibangun endpoint."""

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
        if "update" in ops:
            return SimpleNamespace(data=self.db.hasil_update, count=None)
        if "insert" in ops:
            data = next(a for n, a in self.langkah if n == "insert")[0]
            self.db.terakhir = {**BARIS, **data, "id": "baru"}
            return SimpleNamespace(data=[self.db.terakhir], count=None)
        if "maybe_single" in ops:
            # Baca ulang baris yang baru disimpan (kalau ada), selain itu trailer contoh.
            return SimpleNamespace(data=self.db.terakhir or BARIS, count=None)
        return SimpleNamespace(data=self.db.baris, count=self.db.total)


class _FakeDb:
    def __init__(self) -> None:
        self.query: list[list[tuple[str, Any]]] = []
        self.baris: list[dict[str, Any]] = [BARIS]
        self.total = 25
        self.hasil_update: list[dict[str, Any]] = [BARIS]
        self.terakhir: dict[str, Any] | None = None
        self.rpc_data: list[dict[str, Any]] = []

    def table(self, nama: str) -> _Query:
        return _Query(self, nama)

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Rpc":
        return _Rpc(self.rpc_data)


class _Rpc:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


@pytest.fixture
def db() -> Iterator[_FakeDb]:
    fake = _FakeDb()

    async def override() -> Any:
        yield fake

    app.dependency_overrides[user_client] = override
    app.dependency_overrides[superadmin_or_admin_client] = override
    yield fake
    app.dependency_overrides.clear()


def test_daftar_paging_limit_offset_dan_filter(client: TestClient, db: _FakeDb) -> None:
    res = client.get(
        "/api/unit-trailer",
        params={"page": 2, "page_size": 10, "q": "tr", "status": "perbaikan", "jenis_unit_trailer_id": "j1"},
    )
    assert res.status_code == 200
    langkah = db.query[0]
    assert ("range", (10, 19)) in langkah  # OFFSET 10, LIMIT 10
    assert ("eq", ("status_trailer", "perbaikan")) in langkah
    assert ("eq", ("jenis_unit_trailer_id", "j1")) in langkah
    assert any(n == "or_" and "kode_trailer.ilike" in a[0] for n, a in langkah)
    body = res.json()
    assert body["total"] == 25
    assert body["items"][0] == {
        "id": "t1",
        "kode_trailer": "TR-01",
        "tahun": 2020,
        "jenis_unit_trailer_id": "j1",
        "jenis_nama": "Lowbed 3 as",
        "jenis_unit_nama": "Lowbed",
        "kapasitas_ton": 40.0,
        "status": "standby",
    }


def test_tambah_kode_duplikat_ditolak(client: TestClient, db: _FakeDb) -> None:
    res = client.post("/api/unit-trailer", json={"kode_trailer": " tr-01 ", "jenis_unit_trailer_id": "j1"})
    assert res.status_code == 409
    assert res.json()["detail"] == "Gagal! Unit Trailer dengan kode ini sudah ada"


def test_tambah_berhasil(client: TestClient, db: _FakeDb) -> None:
    db.baris = []  # belum ada kode yang sama
    res = client.post(
        "/api/unit-trailer",
        json={"kode_trailer": "TR-02", "tahun": 2021, "jenis_unit_trailer_id": "j1", "kapasitas_ton": 35},
    )
    assert res.status_code == 201
    insert = next(a for n, a in db.query[1] if n == "insert")
    assert insert[0]["kode_trailer"] == "TR-02"
    assert insert[0]["status_trailer"] == "standby"


def test_hapus_adalah_update_status_2(client: TestClient, db: _FakeDb) -> None:
    res = client.delete("/api/unit-trailer/t1")
    assert res.status_code == 200
    ops = db.query[0]
    assert ("update", ({"status": 2},)) in ops
    assert not any(n == "delete" for n, _ in ops)


def test_ubah_data_yang_sudah_dihapus_404(client: TestClient, db: _FakeDb) -> None:
    db.baris = []
    db.hasil_update = []
    res = client.patch("/api/unit-trailer/t9", json={"kode_trailer": "TR-09", "jenis_unit_trailer_id": "j1"})
    assert res.status_code == 404
    assert res.json()["detail"].startswith("Gagal mengubah data.")


def test_validasi_tahun_dan_kapasitas(client: TestClient, db: _FakeDb) -> None:
    res = client.post(
        "/api/unit-trailer", json={"kode_trailer": "X", "jenis_unit_trailer_id": "j1", "kapasitas_ton": 0}
    )
    assert res.status_code == 422
    assert res.json()["detail"].startswith("Gagal menambah data.")


def test_jenis_unit_trailer_kembar_ditolak(client: TestClient, db: _FakeDb) -> None:
    db.baris = [{"nama": "Flatbed"}]
    res = client.post("/api/unit-trailer/jenis", json={"nama": "  flatbed ", "jenis_unit_id": "ju1"})
    assert res.status_code == 409
    assert res.json()["detail"] == "Gagal! Jenis Unit Trailer dengan nama ini sudah ada"


def test_tambah_jenis_unit_trailer_ke_tabel_sendiri(client: TestClient, db: _FakeDb) -> None:
    db.baris = []
    res = client.post("/api/unit-trailer/jenis", json={"nama": "Flatbed", "jenis_unit_id": "ju1"})
    assert res.status_code == 201
    tabel = [q[0][1] for q in db.query]
    assert "jenis_unit_trailer" in tabel and "jenis_unit" not in tabel
    insert = next(a for q in db.query for n, a in q if n == "insert")
    assert insert[0] == {"nama": "Flatbed", "jenis_unit_id": "ju1"}


def test_jenis_unit_trailer_wajib_punya_jenis_unit(client: TestClient, db: _FakeDb) -> None:
    db.baris = []
    res = client.post("/api/unit-trailer/jenis", json={"nama": "Flatbed"})
    assert res.status_code == 422
    assert res.json()["detail"].startswith("Gagal menambah data.")


@pytest.mark.parametrize(
    ("isian", "pesan"),
    [
        ({"tahun": "20a0"}, "Tahun tidak valid"),
        ({"tahun": 1800}, "Tahun tidak valid"),
        ({"tahun": 2999}, "Tahun tidak valid"),
        ({"kapasitas_ton": "abc"}, "Kapasitas muatan tidak valid"),
        ({"kapasitas_ton": -5}, "Kapasitas muatan tidak valid"),
        ({"kapasitas_ton": 12.345}, "Kapasitas muatan tidak valid"),
    ],
)
def test_tahun_atau_kapasitas_tidak_valid_menggagalkan_tambah(
    client: TestClient, db: _FakeDb, isian: dict[str, object], pesan: str
) -> None:
    db.baris = []
    res = client.post("/api/unit-trailer", json={"kode_trailer": "TR-05", "jenis_unit_trailer_id": "j1", **isian})
    assert res.status_code == 422
    assert res.json()["detail"].startswith(f"Gagal menambah data. {pesan}")
    assert not any(n == "insert" for q in db.query for n, _ in q), "tidak boleh ada data yang tersimpan"


def test_status_terpakai_tidak_lagi_diterima(client: TestClient, db: _FakeDb) -> None:
    db.baris = []
    res = client.post(
        "/api/unit-trailer", json={"kode_trailer": "TR-06", "jenis_unit_trailer_id": "j1", "status": "terpakai"}
    )
    assert res.status_code == 422


def test_tahun_dan_kapasitas_valid_diterima(client: TestClient, db: _FakeDb) -> None:
    db.baris = []
    res = client.post(
        "/api/unit-trailer",
        json={"kode_trailer": "TR-07", "jenis_unit_trailer_id": "j1", "tahun": 2020, "kapasitas_ton": 40.5},
    )
    assert res.status_code == 201


def test_pilihan_trailer_unit_dengan_relasi(client: TestClient, db: _FakeDb) -> None:
    db.rpc_data = [
        {"wajib": True, "id": "t1", "kode_trailer": "TR-01", "jenis_nama": "Lowbed 3 as", "status_trailer": "standby"},
        {
            "wajib": True,
            "id": "t2",
            "kode_trailer": "TR-02",
            "jenis_nama": "Lowbed 3 as",
            "status_trailer": "perbaikan",
        },
    ]
    res = client.get("/api/unit-trailer/untuk-unit/u1")
    assert res.status_code == 200
    body = res.json()
    assert body["wajib"] is True
    assert [t["kode_trailer"] for t in body["trailer"]] == ["TR-01", "TR-02"]


def test_pilihan_trailer_wajib_tapi_belum_ada_trailer(client: TestClient, db: _FakeDb) -> None:
    db.rpc_data = [{"wajib": True, "id": None, "kode_trailer": None, "jenis_nama": None, "status_trailer": None}]
    body = client.get("/api/unit-trailer/untuk-unit/u1").json()
    assert body == {"wajib": True, "trailer": []}


def test_pilihan_trailer_unit_tanpa_relasi(client: TestClient, db: _FakeDb) -> None:
    db.rpc_data = [{"wajib": False, "id": None, "kode_trailer": None, "jenis_nama": None, "status_trailer": None}]
    body = client.get("/api/unit-trailer/untuk-unit/u2").json()
    assert body == {"wajib": False, "trailer": []}

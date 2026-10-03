"""Biaya Lain job: validasi nominal, kuncian setelah job ditagih, dan master
Jenis Biaya. Skenario sukses, edge, dan gagal."""

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import NotFoundError, ValidationError
from app.modules.biaya_lain.service import (
    BiayaLainCreate,
    BiayaLainInput,
    BiayaLainService,
    to_biaya_lain,
    validasi_nominal,
)
from app.modules.jenis_biaya.router import bersihkan_nama, kunci_nama

_BARIS = {
    "id": "b1",
    "job_id": "j1",
    "jenis_biaya_id": "t1",
    "nominal": 25000,
    "catatan": "Tol Cikampek",
    "created_at": "2026-10-03T08:00:00+00:00",
    "jenis": {"nama": "Tol"},
    "creator": {"nama": "Admin Satu"},
}


class _Db:
    """Data API palsu: `tagihan` = baris invoice_items aktif job; setiap
    insert/update (langsung maupun lewat Transaksi) dicatat supaya bisa
    dipastikan tidak terjadi saat ditolak."""

    def __init__(self, *, tagihan: list[dict[str, Any]] | None = None, ada_biaya: bool = True) -> None:
        self.tagihan = tagihan or []
        self.ada_biaya = ada_biaya
        self.tulis: list[tuple[str, str, dict[str, Any]]] = []
        self._tabel = ""
        self._aksi: tuple[str, dict[str, Any]] | None = None
        self._tunggal = False
        self._langkah: list[dict[str, Any]] | None = None

    def table(self, nama: str) -> "_Db":
        self._tabel, self._aksi, self._tunggal, self._langkah = nama, None, False, None
        return self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        assert nama == "jalankan_transaksi"
        self._langkah = params["p_langkah"]
        return self

    def insert(self, data: dict[str, Any]) -> "_Db":
        self._aksi = ("insert", data)
        return self

    def update(self, data: dict[str, Any]) -> "_Db":
        self._aksi = ("update", data)
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    neq = order = limit = eq

    def maybe_single(self) -> "_Db":
        self._tunggal = True
        return self

    async def execute(self) -> SimpleNamespace:
        if self._langkah is not None:
            for lk in self._langkah:
                self.tulis.append((lk["tabel"], lk["op"], lk["data"]))
            return SimpleNamespace(data=[[{"id": "b1"}] for _ in self._langkah])
        if self._aksi is not None:
            self.tulis.append((self._tabel, *self._aksi))
            return SimpleNamespace(data=[{"id": "b1"}])
        if self._tabel == "invoice_items":
            return SimpleNamespace(data=self.tagihan)
        if self._tabel == "jenis_biaya":
            return SimpleNamespace(data={"id": "t1"} if self._tunggal else [{"id": "t1", "nama": "Tol"}])
        if self._tabel == "biaya_lain":
            return SimpleNamespace(data=_BARIS if self.ada_biaya else None)
        return SimpleNamespace(data=[])


_SUDAH_DITAGIH = [{"invoice": {"invoice_number": "INV/2026/001"}}]


def _svc(db: _Db) -> BiayaLainService:
    return BiayaLainService(db)  # type: ignore[arg-type]


def test_mapper_membawa_jenis_dan_pembuat() -> None:
    b = to_biaya_lain(_BARIS)
    assert (b.jenis_biaya_nama, b.nominal, b.created_by_nama, b.catatan) == ("Tol", 25000, "Admin Satu", "Tol Cikampek")


def test_nominal_bulat_positif() -> None:
    assert validasi_nominal(25000) == 25000
    for salah in (0, -5000, 1500.5):
        with pytest.raises(ValidationError):
            validasi_nominal(salah)


async def test_tambah_sebelum_ditagih_tersimpan_dengan_pembuat() -> None:
    db = _Db()
    hasil = await _svc(db).create(
        BiayaLainCreate(job_id="j1", jenis_biaya_id="t1", nominal=25000, catatan="  Tol  "), created_by="u1"
    )
    assert hasil.id == "b1"
    assert len(db.tulis) == 1
    tabel, aksi, data = db.tulis[0]
    assert (tabel, aksi) == ("biaya_lain", "insert")
    assert data == {"job_id": "j1", "jenis_biaya_id": "t1", "nominal": 25000, "catatan": "Tol", "created_by": "u1"}


async def test_jenis_baru_diketik_dibuat_bersama_biaya_dalam_satu_transaksi() -> None:
    db = _Db()
    await _svc(db).create(
        BiayaLainCreate(job_id="j1", jenis_biaya_nama="  Bongkar   muat ", nominal=50_000), created_by="u1"
    )
    (t1, a1, jenis), (t2, a2, biaya) = db.tulis
    assert (t1, a1, jenis) == ("jenis_biaya", "insert", {"nama": "Bongkar muat", "created_by": "u1"})
    # Biaya merujuk jenis baru dari langkah pertama transaksi.
    assert (t2, a2, biaya["jenis_biaya_id"]) == ("biaya_lain", "insert", "{{0.id}}")


async def test_jenis_diketik_yang_sudah_ada_dipakai_tanpa_membuat_baru() -> None:
    db = _Db()
    await _svc(db).create(BiayaLainCreate(job_id="j1", jenis_biaya_nama=" tol ", nominal=50_000), created_by="u1")
    assert [(t, a) for t, a, _ in db.tulis] == [("biaya_lain", "insert")]
    assert db.tulis[0][2]["jenis_biaya_id"] == "t1"


def test_jenis_biaya_wajib_dipilih_atau_diketik() -> None:
    with pytest.raises(PydanticValidationError, match="Jenis biaya wajib"):
        BiayaLainCreate(job_id="j1", nominal=50_000, jenis_biaya_nama="   ")


async def test_tambah_setelah_ditagih_ditolak() -> None:
    db = _Db(tagihan=_SUDAH_DITAGIH)
    with pytest.raises(ValidationError, match="INV/2026/001"):
        await _svc(db).create(BiayaLainCreate(job_id="j1", jenis_biaya_id="t1", nominal=25000), created_by="u1")
    assert db.tulis == []


async def test_ubah_dan_hapus_setelah_ditagih_ditolak() -> None:
    db = _Db(tagihan=_SUDAH_DITAGIH)
    with pytest.raises(ValidationError, match="tidak bisa ditambah, diubah, atau dihapus"):
        await _svc(db).update("b1", BiayaLainInput(jenis_biaya_id="t1", nominal=30000))
    with pytest.raises(ValidationError):
        await _svc(db).delete("b1")
    assert db.tulis == []


async def test_ubah_lewat_transaksi() -> None:
    db = _Db()
    await _svc(db).update("b1", BiayaLainInput(jenis_biaya_id="t1", nominal=30_000, catatan=" baru "))
    assert db.tulis == [("biaya_lain", "update", {"jenis_biaya_id": "t1", "nominal": 30_000, "catatan": "baru"})]


async def test_hapus_sebelum_ditagih_soft_delete() -> None:
    db = _Db()
    await _svc(db).delete("b1")
    assert db.tulis == [("biaya_lain", "update", {"status": 2})]


async def test_ubah_biaya_yang_tidak_ada() -> None:
    db = _Db(ada_biaya=False)
    with pytest.raises(NotFoundError):
        await _svc(db).update("x", BiayaLainInput(jenis_biaya_id="t1", nominal=30000))


def test_nama_jenis_biaya_dirapikan_dan_dibandingkan_tanpa_huruf_besar() -> None:
    assert bersihkan_nama("  Bongkar   muat ") == "Bongkar muat"
    assert kunci_nama("TOL  Tol") == kunci_nama("tol tol")
    with pytest.raises(ValidationError):
        bersihkan_nama("   ")


def test_endpoint_tanpa_login_ditolak(client: Any) -> None:
    assert client.get("/api/jobs/j1/biaya-lain").status_code == 401
    assert client.get("/api/jenis-biaya").status_code == 401

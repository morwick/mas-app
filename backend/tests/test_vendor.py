"""Master vendor: tambah (nama wajib, teks dirapikan), nonaktifkan, dan akses."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.vendors.schemas import VendorCreate, VendorUpdate
from app.modules.vendors.service import VendorService


class _Db:
    def __init__(self) -> None:
        self.tulis: list[tuple[str, dict[str, Any]]] = []
        self._aksi: tuple[str, dict[str, Any]] | None = None

    def table(self, nama: str) -> "_Db":
        assert nama == "vendors"
        self._aksi = None
        return self

    def insert(self, data: dict[str, Any]) -> "_Db":
        self._aksi = ("insert", data)
        return self

    def update(self, data: dict[str, Any]) -> "_Db":
        self._aksi = ("update", data)
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        assert self._aksi
        self.tulis.append(self._aksi)
        baris = {"id": "v1", "created_at": "2026-10-03T00:00:00Z", "is_active": True, **self._aksi[1]}
        return SimpleNamespace(data=[baris])


async def test_tambah_vendor_teks_dirapikan() -> None:
    db = _Db()
    v = await VendorService(db).create(  # type: ignore[arg-type]
        VendorCreate(nama_perusahaan="  PT Sumber Ban  ", kota="  ", pic_nama=" Andi ")
    )
    assert v.nama_perusahaan == "PT Sumber Ban"
    _, data = db.tulis[0]
    assert (data["nama_perusahaan"], data["kota"], data["pic_nama"]) == ("PT Sumber Ban", None, "Andi")


async def test_nama_vendor_kosong_ditolak() -> None:
    with pytest.raises(ValidationError, match="Nama perusahaan wajib diisi"):
        await VendorService(_Db()).create(VendorCreate(nama_perusahaan="   "))  # type: ignore[arg-type]


async def test_ubah_dan_nonaktifkan_vendor() -> None:
    db = _Db()
    svc = VendorService(db)  # type: ignore[arg-type]
    await svc.update("v1", VendorUpdate(termin_hari=30))
    await svc.deactivate("v1")
    assert db.tulis == [("update", {"termin_hari": 30}), ("update", {"is_active": False})]


def test_endpoint_vendor_tanpa_login_ditolak(client: Any) -> None:
    assert client.get("/api/vendors").status_code == 401
    assert client.get("/api/vendors/page").status_code == 401

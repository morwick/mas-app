"""Riwayat uang jalan: pengajuan tambahan yang dibatalkan (migration 20261001000024)."""

from types import SimpleNamespace
from typing import Any

from app.modules.uang_jalan.service import UangJalanService


class _Rpc:
    def __init__(self, data: Any = None, gagal: bool = False) -> None:
        self.data = data or []
        self.gagal = gagal
        self.dipanggil: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Rpc":
        self.dipanggil.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        if self.gagal:
            raise RuntimeError("fungsi belum ada")
        return SimpleNamespace(data=self.data)


async def test_daftar_dibatalkan_dibaca_lewat_rpc() -> None:
    db = _Rpc([{"id": "u9", "tanggal": "2026-09-21", "jumlah": 700000, "keperluan": "Ban", "catatan": None,
                "created_at": "2026-09-21T01:00:00+00:00"}])
    hasil = await UangJalanService(db)._tambahan_dibatalkan("j1")  # type: ignore[arg-type]
    assert db.dipanggil == [("tambahan_uang_jalan_dibatalkan", {"p_job_id": "j1"})]
    assert hasil[0].id == "u9" and hasil[0].jumlah == 700000


async def test_migrasi_belum_jalan_tidak_menjatuhkan_halaman() -> None:
    assert await UangJalanService(_Rpc(gagal=True))._tambahan_dibatalkan("j1") == []  # type: ignore[arg-type]

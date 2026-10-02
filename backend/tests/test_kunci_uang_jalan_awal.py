"""Uang jalan awal terkunci setelah ada uang jalan keluar (pencairan)."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.uang_jalan.service import UangJalanService


class _Db:
    def __init__(self, pencairan: list[dict[str, Any]]) -> None:
        self.pencairan = pencairan
        self.tabel = ""
        self.diubah: list[dict[str, Any]] = []
        self._update: dict[str, Any] | None = None

    def table(self, nama: str) -> "_Db":
        self.tabel = nama
        self._update = None
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def limit(self, *_: object) -> "_Db":
        return self

    def update(self, data: dict[str, Any]) -> "_Db":
        self._update = data
        return self

    async def execute(self) -> SimpleNamespace:
        if self._update is not None:
            self.diubah.append(self._update)
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=self.pencairan if self.tabel == "uang_jalan" else [])


async def test_belum_ada_pencairan_boleh_diubah() -> None:
    db = _Db([])
    await UangJalanService(db).set_uang_jalan_awal("j1", 2_000_000)  # type: ignore[arg-type]
    assert db.diubah == [{"uang_jalan_awal": 2_000_000}]


async def test_sudah_ada_pencairan_ditolak() -> None:
    db = _Db([{"id": "u1"}])
    with pytest.raises(ValidationError, match="sudah dikasih ke driver"):
        await UangJalanService(db).set_uang_jalan_awal("j1", 2_000_000)  # type: ignore[arg-type]
    assert db.diubah == []

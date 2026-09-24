"""Pengecekan email ganda saat tambah/edit pengguna."""

import asyncio
from types import SimpleNamespace

import pytest

from app.core.errors import ConflictError
from app.modules.users.router import _ensure_email_available


class _FakeQuery:
    def __init__(self, data: list[dict[str, str]]) -> None:
        self._data = data

    def select(self, *_: object) -> "_FakeQuery":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


class _FakeClient:
    def __init__(self, data: list[dict[str, str]]) -> None:
        self._data = data

    def table(self, _: str) -> _FakeQuery:
        return _FakeQuery(self._data)


PROFILES = [
    {"id": "u1", "email": "Budi_Santoso@Mas.co.id"},
    {"id": "u2", "email": "sari@mas.co.id"},
]


def _check(email: str, exclude_id: str | None = None) -> None:
    asyncio.run(_ensure_email_available(_FakeClient(PROFILES), email, "dup", exclude_id))  # type: ignore[arg-type]


def test_rejects_existing_email_case_insensitive() -> None:
    with pytest.raises(ConflictError, match="dup"):
        _check("budi_santoso@mas.co.id")


def test_underscore_is_not_a_wildcard() -> None:
    # `_` harus dibandingkan apa adanya, bukan sebagai wildcard ilike.
    _check("budiXsantoso@mas.co.id")


def test_allows_new_email() -> None:
    _check("baru@mas.co.id")


def test_own_email_is_not_a_duplicate_when_editing() -> None:
    _check("sari@mas.co.id", exclude_id="u2")


def test_other_users_email_is_duplicate_when_editing() -> None:
    with pytest.raises(ConflictError):
        _check("sari@mas.co.id", exclude_id="u1")

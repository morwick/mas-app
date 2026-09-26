"""Insiden bisa dicatat untuk unit atau unit trailer (tepat satu)."""

from typing import Any

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.modules.incidents.schemas import IncidentCreate


def _insiden(**over: Any) -> IncidentCreate:
    return IncidentCreate(**{"tipe": "kerusakan", "tanggal": "2026-09-26T08:00:00+07:00", "deskripsi": "x", **over})


def test_insiden_untuk_trailer() -> None:
    assert _insiden(unit_trailer_id="t1").unit_trailer_id == "t1"


@pytest.mark.parametrize("aset", [{}, {"unit_id": "u1", "unit_trailer_id": "t1"}])
def test_insiden_harus_tepat_satu_aset(aset: dict[str, str]) -> None:
    with pytest.raises(PydanticValidationError):
        _insiden(**aset)

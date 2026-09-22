"""Bantuan kecil untuk membaca hasil PostgREST.

PostgREST mengembalikan relasi to-one kadang sebagai objek, kadang sebagai
array satu elemen tergantung bentuk query, dan kolom NUMERIC/BIGINT sebagai
string. Ditangani di satu tempat supaya mapper tiap modul tidak perlu tahu.
"""

from __future__ import annotations

from typing import Any, TypeVar

T = TypeVar("T")


def first(value: Any) -> dict[str, Any] | None:
    """Ratakan embed to-one: `{...}` / `[{...}]` / None → dict atau None."""
    if not value:
        return None
    if isinstance(value, list):
        return value[0] if value else None
    return value


def num(value: Any, default: float = 0.0) -> float:
    """NUMERIC dari PostgREST bisa datang sebagai str; kembalikan float aman."""
    if value is None or value == "":
        return default
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return n if n == n and n not in (float("inf"), float("-inf")) else default


def num_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None


def clean_text(value: str | None) -> str | None:
    """'' dan spasi kosong → None; sisanya di-trim."""
    if value is None:
        return None
    text = value.strip()
    return text or None


def rows(result: Any) -> list[dict[str, Any]]:
    """`.execute()` → daftar dict (kosong bila None)."""
    if result is None:
        return []
    data = getattr(result, "data", None)
    if data is None:
        return []
    return list(data) if isinstance(data, list) else [data]


def single(result: Any) -> dict[str, Any] | None:
    """`.maybe_single().execute()` → dict atau None."""
    if result is None:
        return None
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    return data

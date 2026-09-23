"""Pagination sisi server untuk endpoint daftar.

Dipakai bersama `limit`/`offset` PostgREST (`.range()`) dan penghitungan baris
(`count=exact`) supaya klien tahu total data tanpa mengunduh semuanya.

Catatan penting: begitu server memotong hasil, pencarian dan filter juga harus
dijalankan di server. Menyaring di browser hanya akan menyaring satu halaman
yang sedang tampil, bukan seluruh data.
"""

from __future__ import annotations

from typing import Annotated, Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200


class PageParams(BaseModel):
    """Parameter halaman yang dipakai seluruh endpoint daftar."""

    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def last_index(self) -> int:
        """Indeks terakhir untuk `.range()` PostgREST — inklusif."""
        return self.offset + self.page_size - 1


# Annotated dipakai (bukan default `= Query(...)`) supaya fungsinya tetap bisa
# dipanggil langsung di luar FastAPI — mis. dari test dan kode internal.
def page_params(
    page: Annotated[int, Query(ge=1, description="Nomor halaman, mulai dari 1")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=MAX_PAGE_SIZE, description="Jumlah baris per halaman")
    ] = DEFAULT_PAGE_SIZE,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class Page(BaseModel, Generic[T]):
    """Satu halaman hasil beserta total keseluruhan."""

    items: list[T] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE


def build_page(items: list[T], total: int | None, params: PageParams) -> Page[T]:
    return Page[T](
        items=items,
        # PostgREST mengembalikan None untuk count bila header-nya tidak terkirim;
        # jatuh kembali ke jumlah baris halaman ini daripada melaporkan 0.
        total=total if total is not None else len(items),
        page=params.page,
        page_size=params.page_size,
    )


def apply_window(query: Any, params: PageParams) -> Any:
    """Pasang jendela baris. `.range()` PostgREST inklusif di kedua ujung."""
    return query.range(params.offset, params.last_index)


def escape_like(text: str) -> str:
    """Lolos-kan karakter wildcard agar pencarian diperlakukan harfiah.

    Tanpa ini, mengetik `%` di kotak cari akan cocok dengan seluruh baris, dan
    koma memecah daftar `or=(...)` PostgREST jadi kondisi tambahan.
    """
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace(",", " ")


def ilike_any(columns: list[str], term: str) -> str:
    """Rangkai filter `or=` PostgREST: cocok bila salah satu kolom mengandung term."""
    safe = escape_like(term.strip())
    return ",".join(f"{c}.ilike.%{safe}%" for c in columns)

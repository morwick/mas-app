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
# page_size = -1 berarti "tampilkan semua". Dipilih sebagai sentinel karena
# 0 ambigu dengan "tidak diisi" pada query string.
ALL_PAGE_SIZE = -1


# Pagar untuk opsi "semua" — kalau data melebihi ini, sisanya tetap terpotong
# dan `total` di respons memperlihatkan selisihnya.
_ALL_HARD_CAP = 5000


class PageParams(BaseModel):
    """Parameter halaman yang dipakai seluruh endpoint daftar."""

    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE

    @property
    def is_all(self) -> bool:
        return self.page_size == ALL_PAGE_SIZE

    @property
    def offset(self) -> int:
        return 0 if self.is_all else (self.page - 1) * self.page_size

    @property
    def last_index(self) -> int:
        """Indeks terakhir untuk `.range()` PostgREST — inklusif."""
        # Batas atas tetap dipasang walau "semua", sebagai pagar agar satu
        # permintaan tidak bisa menarik jutaan baris sekaligus.
        return _ALL_HARD_CAP - 1 if self.is_all else self.offset + self.page_size - 1


# Annotated dipakai (bukan default `= Query(...)`) supaya fungsinya tetap bisa
# dipanggil langsung di luar FastAPI — mis. dari test dan kode internal.
def page_params(
    page: Annotated[int, Query(ge=1, description="Nomor halaman, mulai dari 1")] = 1,
    page_size: Annotated[
        int,
        Query(
            ge=ALL_PAGE_SIZE,
            le=MAX_PAGE_SIZE,
            description=f"Baris per halaman; {ALL_PAGE_SIZE} berarti semua",
        ),
    ] = DEFAULT_PAGE_SIZE,
) -> PageParams:
    if page_size == 0:
        page_size = DEFAULT_PAGE_SIZE
    return PageParams(page=1 if page_size == ALL_PAGE_SIZE else page, page_size=page_size)


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


def _kutip_postgrest(nilai: str) -> str:
    """Nilai di dalam `or=(...)` dibungkus kutip ganda supaya `(`, `)`, `,`, dan
    `"` tidak dibaca sebagai sintaks PostgREST (mis. "PT Maju (Persero)")."""
    return '"' + nilai.replace("\\", "\\\\").replace('"', '\\"') + '"'


def ilike_any(columns: list[str], term: str) -> str:
    """Rangkai filter `or=` PostgREST: cocok bila salah satu kolom mengandung term."""
    pola = _kutip_postgrest(f"%{escape_like(term.strip())}%")
    return ",".join(f"{c}.ilike.{pola}" for c in columns)

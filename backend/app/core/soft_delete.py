"""Soft delete untuk seluruh tabel aplikasi (schema transport & hr).

Setiap tabel punya kolom `status` dengan fungsi yang sama di mana pun:

- 1 (`AKTIF`)   — data hidup; nilai default saat insert.
- 2 (`DIHAPUS`) — dihapus pengguna lewat web/mobile. Barisnya tetap ada di
  database supaya bisa dikembalikan kalau ternyata salah hapus.

Klien Supabase aplikasi (`DataClient`) membungkus query builder tabel:

- `.select(...)` otomatis diberi `WHERE status = 1`;
- `.update(...)` hanya mengenai baris yang masih aktif;
- `.delete()` diubah menjadi `UPDATE ... SET status = 2` — aplikasi tidak
  pernah mengirim DELETE ke database.

Filter ini hanya berlaku untuk tabel yang di-query langsung. Untuk daftar anak
yang di-embed (mis. `items:invoice_items(...)` di dalam select invoice), tambah
filter embed-nya sendiri: `.eq("items.status", AKTIF)`.
"""

from __future__ import annotations

from typing import Any

from postgrest import AsyncRequestBuilder
from supabase import AsyncClient

AKTIF = 1
DIHAPUS = 2

STATUS = "status"


class SoftDeleteTable:
    """Pembungkus `AsyncRequestBuilder` — lihat docstring modul."""

    def __init__(self, builder: AsyncRequestBuilder) -> None:
        self._builder = builder

    def select(self, *columns: str, **kwargs: Any) -> Any:
        return self._builder.select(*columns, **kwargs).eq(STATUS, AKTIF)

    def update(self, json: dict[str, Any], **kwargs: Any) -> Any:
        return self._builder.update(json, **kwargs).eq(STATUS, AKTIF)

    def delete(self, **kwargs: Any) -> Any:
        return self._builder.update({STATUS: DIHAPUS}, **kwargs).eq(STATUS, AKTIF)

    def insert(self, *args: Any, **kwargs: Any) -> Any:
        return self._builder.insert(*args, **kwargs)

    def upsert(self, *args: Any, **kwargs: Any) -> Any:
        return self._builder.upsert(*args, **kwargs)


class DataClient(AsyncClient):
    """AsyncClient yang semua akses tabelnya lewat `SoftDeleteTable`."""

    def from_(self, table_name: str) -> SoftDeleteTable:  # type: ignore[override]
        return SoftDeleteTable(super().from_(table_name))

    def table(self, table_name: str) -> SoftDeleteTable:  # type: ignore[override]
        return self.from_(table_name)

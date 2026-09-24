"""Transaksi database untuk proses tulis yang terdiri dari beberapa langkah.

Setiap permintaan ke Supabase Data API (PostgREST) sudah satu transaksi,
jadi tambah/ubah/hapus satu langkah sudah otomatis BEGIN → COMMIT, atau
ROLLBACK kalau gagal. Proses beberapa langkah (mis. simpan invoice lalu
item-itemnya) harus dikirim sekaligus lewat `Transaksi`, supaya database
menjalankannya dalam SATU transaksi (fungsi `jalankan_transaksi`, migration
20260924000008):

    tx = Transaksi(db)
    nomor = tx.nomor_dokumen("invoice")
    inv = tx.insert("invoices", {"invoice_number": nomor["nomor"], ...})
    tx.insert("invoice_items", [{"invoice_id": inv["id"], ...}])
    hasil = await tx.jalankan()      # BEGIN … COMMIT, atau ROLLBACK semua

Kalau satu langkah gagal, tidak ada satu pun yang tersimpan dan error-nya
naik ke handler global (app/core/errors.py) yang menampilkan pesan gagal.
Transaksi berjalan dengan hak akses pengguna yang login (RLS tetap berlaku).
"""

from __future__ import annotations

from typing import Any, Literal

from supabase import AsyncClient

from app.core.pg import rows


class Rujukan:
    """Nilai dari hasil langkah sebelumnya, mis. `inv["id"]`."""

    def __init__(self, indeks: int) -> None:
        self._indeks = indeks

    def __getitem__(self, kolom: str) -> str:
        return "{{" + f"{self._indeks}.{kolom}" + "}}"


class Transaksi:
    def __init__(self, db: AsyncClient) -> None:
        self._db = db
        self._langkah: list[dict[str, Any]] = []

    def _tambah(self, langkah: dict[str, Any]) -> Rujukan:
        self._langkah.append(langkah)
        return Rujukan(len(self._langkah) - 1)

    def nomor_dokumen(self, jenis: Literal["invoice", "quotation"]) -> Rujukan:
        """Ambil nomor surat berikutnya — ikut rollback kalau transaksi gagal."""
        return self._tambah({"op": "nomor_dokumen", "jenis": jenis})

    def setting(self, nama: str, nilai: str | None) -> None:
        """Setting lokal transaksi (`app.*`), mis. catatan untuk trigger riwayat."""
        self._tambah({"op": "setting", "nama": nama, "nilai": nilai or ""})

    def insert(self, tabel: str, data: dict[str, Any] | list[dict[str, Any]]) -> Rujukan:
        return self._tambah({"op": "insert", "tabel": tabel, "data": data})

    def update(self, tabel: str, data: dict[str, Any], filter: dict[str, Any], *, wajib: bool = True) -> Rujukan:
        """Ubah baris aktif. `wajib`: gagal (rollback) kalau tidak ada baris yang kena."""
        return self._tambah({"op": "update", "tabel": tabel, "data": data, "filter": filter, "wajib": wajib})

    def hapus(self, tabel: str, filter: dict[str, Any], *, wajib: bool = False) -> Rujukan:
        """Soft delete (status = 2) di dalam transaksi."""
        return self._tambah({"op": "hapus", "tabel": tabel, "filter": filter, "wajib": wajib})

    async def jalankan(self) -> list[list[dict[str, Any]]]:
        """BEGIN → semua langkah → COMMIT. Satu gagal → ROLLBACK semuanya."""
        res = await self._db.rpc("jalankan_transaksi", {"p_langkah": self._langkah}).execute()
        data = res.data
        # PostgREST mengembalikan nilai jsonb fungsi apa adanya (array per langkah).
        if isinstance(data, list) and all(isinstance(x, list) for x in data):
            return data
        return [rows(x) if not isinstance(x, list) else x for x in (data or [])]

"""Sinkronkan baris anak (PIC, rincian perintah kerja, …) di dalam `Transaksi`.

Baris yang dikirim dengan `id` milik induk ini → diubah; tanpa `id` (atau id
asing) → ditambah; baris lama yang tidak dikirim lagi → dihapus (soft delete).
Urutannya hapus → (reset) → ubah → tambah, supaya index unik parsial (mis.
satu PIC utama, mekanik tidak kembar) tidak bentrok di tengah transaksi.
"""

from __future__ import annotations

from typing import Any

from app.core.transaksi import Rujukan, Transaksi


def sinkron_anak(
    tx: Transaksi,
    tabel: str,
    kolom_induk: str,
    induk: str | Rujukan,
    lama_ids: set[str],
    baris: list[dict[str, Any]],
    *,
    reset: dict[str, Any] | None = None,
) -> None:
    """`reset`: nilai yang dipasang dulu ke semua baris lama sebelum diubah,
    mis. `{"is_utama": False}` agar PIC utama bisa berpindah."""
    induk_nilai = induk["id"] if isinstance(induk, Rujukan) else induk
    dikirim = {b["id"] for b in baris if b.get("id") in lama_ids}
    for hapus_id in sorted(lama_ids - dikirim):
        tx.hapus(tabel, {"id": hapus_id})
    if reset and dikirim:
        for ubah_id in sorted(dikirim):
            tx.update(tabel, reset, {"id": ubah_id})
    for b in baris:
        data = {k: v for k, v in b.items() if k != "id"}
        if b.get("id") in dikirim:
            tx.update(tabel, data, {"id": b["id"]})
        else:
            tx.insert(tabel, {kolom_induk: induk_nilai, **data})

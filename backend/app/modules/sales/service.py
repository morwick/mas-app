"""Master sales (migration 20261003000001).

Sales job dipilih dari daftar atau diketik di form. Nama yang belum ada di
daftar menjadi sales baru, disimpan di transaksi yang SAMA dengan job-nya —
job gagal tersimpan = sales baru juga tidak tersimpan.
"""

from __future__ import annotations

from typing import Protocol

from supabase import AsyncClient

from app.core.errors import ValidationError
from app.core.pg import clean_text, rows
from app.core.transaksi import Rujukan, Transaksi
from app.modules.sales.schemas import Sales


class IsianSales(Protocol):
    """Isian sales di payload job (JobCreate / JobUpdate)."""

    sales_id: str | None
    sales_nama: str | None
    sales_no_hp: str | None


def _kunci(nama: str) -> str:
    """Pembanding nama: tanpa beda huruf besar/kecil dan spasi berlebih."""
    return " ".join(nama.split()).casefold()


class SalesService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def daftar(self) -> list[Sales]:
        res = await self._db.table("sales").select("id, nama, no_hp").order("nama").execute()
        return [Sales(**r) for r in rows(res)]

    async def siapkan(self, tx: Transaksi, isian: list[IsianSales], *, created_by: str | None) -> list[str | None]:
        """Tentukan `sales_id` tiap job dan tambahkan langkah sales ke `tx`.

        Hasil per isian: id sales (atau rujukan ke sales baru di `tx`), atau
        None bila job tanpa sales. Langkah sales ditambahkan ke `tx` sebelum
        langkah job, jadi pemanggil menambah job SETELAH memanggil ini.

        - `sales_id` diisi → sales dari daftar; No HP yang diubah di form
          ikut memperbarui master.
        - hanya `sales_nama` → dicocokkan dengan daftar (nama sama = sales
          yang sama); belum ada → sales baru. Nama baru yang sama di beberapa
          job dalam satu form hanya dibuat sekali.
        """
        if not any(i.sales_id or clean_text(i.sales_nama) for i in isian):
            return [None] * len(isian)

        master = await self.daftar()
        per_id = {s.id: s for s in master}
        per_nama = {_kunci(s.nama): s for s in master}
        baru: dict[str, Rujukan] = {}
        hp_diubah: dict[str, str] = {}
        hasil: list[str | None] = []

        for i in isian:
            nama = clean_text(i.sales_nama)
            no_hp = clean_text(i.sales_no_hp)
            sales = per_id.get(i.sales_id) if i.sales_id else (per_nama.get(_kunci(nama)) if nama else None)
            if i.sales_id and sales is None:
                raise ValidationError("Sales yang dipilih tidak ditemukan atau sudah dihapus. Pilih ulang sales.")
            if sales is not None:
                if no_hp and no_hp != sales.no_hp:
                    hp_diubah[sales.id] = no_hp
                hasil.append(sales.id)
            elif nama:
                kunci = _kunci(nama)
                if kunci not in baru:
                    baru[kunci] = tx.insert(
                        "sales", {"nama": " ".join(nama.split()), "no_hp": no_hp, "created_by": created_by}
                    )
                hasil.append(baru[kunci]["id"])
            else:
                hasil.append(None)

        for sales_id, no_hp in hp_diubah.items():
            tx.update("sales", {"no_hp": no_hp}, {"id": sales_id})
        return hasil

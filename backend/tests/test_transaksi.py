"""Transaksi: semua langkah dikirim dalam SATU panggilan jalankan_transaksi."""

import asyncio
from types import SimpleNamespace
from typing import Any

from app.core.transaksi import Transaksi


class _FakeDb:
    def __init__(self, hasil: Any) -> None:
        self.panggilan: list[tuple[str, dict[str, Any]]] = []
        self._hasil = hasil

    def rpc(self, nama: str, params: dict[str, Any]) -> "_FakeDb":
        self.panggilan.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._hasil)


def test_semua_langkah_dikirim_sekaligus_dengan_rujukan() -> None:
    db = _FakeDb([[{"nomor": "0001/INV"}], [{"id": "inv-1"}], [{"id": "item-1"}]])
    tx = Transaksi(db)  # type: ignore[arg-type]
    nomor = tx.nomor_dokumen("invoice")
    inv = tx.insert("invoices", {"invoice_number": nomor["nomor"]})
    tx.insert("invoice_items", [{"invoice_id": inv["id"], "deskripsi": "Sewa"}])
    hasil = asyncio.run(tx.jalankan())

    assert len(db.panggilan) == 1, "harus satu panggilan = satu transaksi"
    nama, params = db.panggilan[0]
    assert nama == "jalankan_transaksi"
    assert params["p_langkah"] == [
        {"op": "nomor_dokumen", "jenis": "invoice"},
        {"op": "insert", "tabel": "invoices", "data": {"invoice_number": "{{0.nomor}}"}},
        {"op": "insert", "tabel": "invoice_items", "data": [{"invoice_id": "{{1.id}}", "deskripsi": "Sewa"}]},
    ]
    assert hasil[1][0]["id"] == "inv-1"


def test_update_wajib_dan_hapus_soft() -> None:
    db = _FakeDb([[], [], []])
    tx = Transaksi(db)  # type: ignore[arg-type]
    tx.setting("app.status_note", None)
    tx.update("units", {"status_operasional": "standby"}, {"id": "u1"})
    tx.hapus("job_photos", {"job_id": "j1", "slot": "depan"})
    asyncio.run(tx.jalankan())

    langkah = db.panggilan[0][1]["p_langkah"]
    assert langkah[0] == {"op": "setting", "nama": "app.status_note", "nilai": ""}
    assert langkah[1]["wajib"] is True  # edit data yang tidak ada → gagal & rollback
    assert langkah[2] == {
        "op": "hapus",
        "tabel": "job_photos",
        "filter": {"job_id": "j1", "slot": "depan"},
        "wajib": False,
    }

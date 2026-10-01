"""Penawaran: rute (kecamatan) & jenis unit per item + rekomendasi harga terakhir."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.quotations import service as svc_mod
from app.modules.quotations.schemas import QuotationInput, QuotationItemInput
from app.modules.quotations.service import QuotationService, _item_rows, _validate


def _item(**ubah: Any) -> QuotationItemInput:
    data: dict[str, Any] = {
        "dari": "Binawidya - Pekanbaru",
        "tujuan": "Bangkinang - Kampar",
        "dari_kecamatan_kode": "14.71.08",
        "tujuan_kecamatan_kode": "14.06.01",
        "jenis_unit_id": "ju-lowbed",
        "qty": 1,
        "harga_satuan": 5_000_000,
    }
    data.update(ubah)
    return QuotationItemInput(**data)


def _payload(*items: QuotationItemInput) -> QuotationInput:
    return QuotationInput(
        customer_id="c1",
        kota_terbit="Pekanbaru",
        tanggal="2026-10-01",
        berlaku_sampai="2026-10-15",
        perihal="Surat Penawaran",
        items=list(items),
    )


def test_item_lengkap_lolos_validasi() -> None:
    _validate(_payload(_item()))


@pytest.mark.parametrize(
    ("kolom", "pesan"),
    [
        ("dari_kecamatan_kode", 'Baris 1: kecamatan "Dari" wajib dipilih'),
        ("tujuan_kecamatan_kode", 'Baris 1: kecamatan "Tujuan" wajib dipilih'),
        ("jenis_unit_id", "Baris 1: jenis unit wajib dipilih"),
    ],
)
def test_kecamatan_dan_jenis_unit_wajib(kolom: str, pesan: str) -> None:
    with pytest.raises(ValidationError, match=pesan):
        _validate(_payload(_item(**{kolom: None})))
    with pytest.raises(ValidationError, match=pesan):
        _validate(_payload(_item(**{kolom: "  "})))


def test_item_rows_menyimpan_rute_dan_jenis_unit() -> None:
    [baris] = _item_rows("q1", [_item(dari_kecamatan_kode=" 14.71.08 ")])
    assert baris["dari_kecamatan_kode"] == "14.71.08"
    assert baris["tujuan_kecamatan_kode"] == "14.06.01"
    assert baris["jenis_unit_id"] == "ju-lowbed"
    # Teks yang dicetak tetap tersimpan apa adanya.
    assert baris["dari"] == "Binawidya - Pekanbaru"


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data
        self.panggilan: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.panggilan.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


def _baris(**ubah: Any) -> dict[str, Any]:
    r: dict[str, Any] = {
        "lingkup": "customer",
        "kategori": "deal",
        "quotation_id": "q1",
        "quote_number": "0001/SK/MAS/IX/2026",
        "customer_id": "c1",
        "customer_nama": "PT A",
        "tanggal": "2026-09-01",
        "berlaku_sampai": "2026-09-15",
        "diputuskan_at": "2026-09-03T02:00:00+00:00",
        "harga": 9_500_000,
        "harga_satuan": 10_000_000,
        "harga_revisi": 9_500_000,
        "nama_alat": "PC200",
        "qty": 1,
        "satuan": "Unit",
    }
    r.update(ubah)
    return r


async def test_rekomendasi_memanggil_fungsi_db_dan_memetakan_hasil(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc_mod, "today_wib_str", lambda: "2026-10-01")
    db = _Db(
        [
            _baris(),
            _baris(kategori="menunggu", berlaku_sampai="2026-09-30", harga_revisi=None, harga=13_000_000),
            _baris(lingkup="semua", kategori="menunggu", berlaku_sampai="2026-10-01", harga_revisi=None),
        ]
    )
    hasil = await QuotationService(db).rekomendasi_harga(  # type: ignore[arg-type]
        dari_kecamatan_kode="14.71.08",
        tujuan_kecamatan_kode="14.06.01",
        jenis_unit_id="ju-lowbed",
        customer_id="c1",
        kecuali_quotation_id="",
    )
    assert db.panggilan == [
        (
            "rekomendasi_harga_penawaran",
            {
                "p_dari_kecamatan_kode": "14.71.08",
                "p_tujuan_kecamatan_kode": "14.06.01",
                "p_jenis_unit_id": "ju-lowbed",
                "p_customer_id": "c1",
                "p_kecuali_quotation_id": None,
            },
        )
    ]
    deal, menunggu_lewat, menunggu_hari_ini = hasil
    assert (deal.harga, deal.harga_revisi, deal.kedaluwarsa) == (9_500_000, 9_500_000, False)
    # Masa berlaku lewat → ditandai kedaluwarsa; berlaku sampai hari ini masih aktif.
    assert menunggu_lewat.kedaluwarsa is True
    assert menunggu_hari_ini.kedaluwarsa is False
    assert menunggu_lewat.harga_revisi is None


async def test_rekomendasi_kosong() -> None:
    hasil = await QuotationService(_Db([])).rekomendasi_harga(  # type: ignore[arg-type]
        dari_kecamatan_kode="11.01.01", tujuan_kecamatan_kode="14.06.01", jenis_unit_id="ju"
    )
    assert hasil == []

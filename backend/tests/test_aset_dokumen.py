"""Data aset untuk isi surat penjualan, BAST, dan berita acara penghapusan."""

from app.modules.penjualan_unit.aset import aset_dokumen


def test_unit() -> None:
    r = {
        "jenis_aset": "unit",
        "unit": {
            "kode_unit": "TR-01",
            "no_polisi": "B 1234 XY",
            "tahun": 2019,
            "stnk_nomor": "S1",
            "kir_nomor": "K1",
            "jenis_unit": {"nama": "Lowbed"},
        },
        "unit_trailer": None,
    }
    a = aset_dokumen(r)
    assert (a.kode, a.jenis_nama, a.no_polisi, a.stnk_nomor, a.srut_nomor) == (
        "TR-01",
        "Lowbed",
        "B 1234 XY",
        "S1",
        None,
    )


def test_unit_trailer() -> None:
    r = {
        "jenis_aset": "unit_trailer",
        "unit": None,
        "unit_trailer": {
            "kode_trailer": "TL-01",
            "tahun": 2020,
            "kapasitas_ton": "40.00",
            "kir_nomor": "K2",
            "srut_nomor": "SR2",
            "jenis": {"nama": "Lowbed 3 as"},
        },
    }
    a = aset_dokumen(r)
    assert (a.kode, a.jenis_nama, a.kapasitas_ton, a.srut_nomor, a.no_polisi) == (
        "TL-01",
        "Lowbed 3 as",
        40.0,
        "SR2",
        None,
    )

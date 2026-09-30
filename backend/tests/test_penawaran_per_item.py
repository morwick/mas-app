"""Penawaran: keputusan deal / tolak per item, revisi harga, dan job per item deal."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.jobs.schemas import JobCreate
from app.modules.jobs.service import JobService
from app.modules.quotations.schemas import (
    KeputusanItemInput,
    SetQuotationStatusRequest,
    SimpanKeputusanRequest,
    SuratRevisiRequest,
)
from app.modules.quotations.service import QuotationService, status_dari_keputusan


class _Db:
    """Fake PostgREST: data per tabel; langkah transaksi (rpc) direkam."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data
        self.tabel = ""
        self.langkah: list[dict[str, Any]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, nama: str) -> "_Db":
        self.tabel = nama
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def neq(self, *_: object) -> "_Db":
        return self

    def order(self, *_: object, **__: object) -> "_Db":
        return self

    def maybe_single(self) -> "_Db":
        return self

    def limit(self, *_: object) -> "_Db":
        return self

    def is_(self, *_: object) -> "_Db":
        return self

    @property
    def not_(self) -> "_Db":
        return self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        if "p_langkah" not in params:
            # Fungsi DB biasa (nama_karyawan, catat_cetak_penawaran): data "__rpc__<nama>".
            self.rpc_calls.append((nama, params))
            self.tabel = f"__rpc__{nama}"
            return self
        self.langkah = params["p_langkah"]
        self.tabel = "__rpc__"
        return self

    async def execute(self) -> SimpleNamespace:
        if self.tabel == "__rpc__":
            return SimpleNamespace(data=[[{}] for _ in self.langkah])
        return SimpleNamespace(data=self.data.get(self.tabel))


def _items() -> list[dict[str, Any]]:
    return [
        {"id": f"i{n}", "urutan": n, "keputusan": "menunggu", "harga_revisi": None, "alasan_ditolak": None}
        for n in (1, 2, 3)
    ]


def test_status_dari_keputusan() -> None:
    assert status_dari_keputusan(["deal", "menunggu"]) == "terkirim"
    assert status_dari_keputusan(["deal", "ditolak", "deal"]) == "deal"
    assert status_dari_keputusan(["ditolak", "ditolak"]) == "ditolak"


async def test_dua_dari_tiga_item_deal_dengan_revisi_harga() -> None:
    db = _Db({"quotations": {"status_penawaran": "terkirim"}, "quotation_items": _items()})
    status = await QuotationService(db).simpan_keputusan(  # type: ignore[arg-type]
        "q1",
        SimpanKeputusanRequest(
            items=[
                KeputusanItemInput(item_id="i1", keputusan="deal", harga_revisi=4_500_000),
                KeputusanItemInput(item_id="i2", keputusan="deal"),
                KeputusanItemInput(item_id="i3", keputusan="ditolak", alasan="Harga terlalu tinggi"),
            ]
        ),
    )
    assert status == "deal"
    ubah_item = [lg for lg in db.langkah if lg["tabel"] == "quotation_items"]
    assert ubah_item[0]["data"]["harga_revisi"] == 4_500_000  # harga awal tidak disentuh
    assert "harga_satuan" not in ubah_item[0]["data"]
    assert ubah_item[2]["data"]["alasan_ditolak"] == "Harga terlalu tinggi"
    header = next(lg for lg in db.langkah if lg["tabel"] == "quotations")
    assert header["data"]["status_penawaran"] == "deal"


async def test_semua_item_ditolak_penawaran_ditolak() -> None:
    db = _Db({"quotations": {"status_penawaran": "terkirim"}, "quotation_items": _items()})
    status = await QuotationService(db).simpan_keputusan(  # type: ignore[arg-type]
        "q1",
        SimpanKeputusanRequest(items=[KeputusanItemInput(item_id=f"i{n}", keputusan="ditolak") for n in (1, 2, 3)]),
    )
    assert status == "ditolak"


async def test_sebagian_diputuskan_tetap_terkirim() -> None:
    db = _Db({"quotations": {"status_penawaran": "terkirim"}, "quotation_items": _items()})
    status = await QuotationService(db).simpan_keputusan(  # type: ignore[arg-type]
        "q1", SimpanKeputusanRequest(items=[KeputusanItemInput(item_id="i1", keputusan="deal")])
    )
    assert status == "terkirim"


async def test_keputusan_draft_ditolak() -> None:
    db = _Db({"quotations": {"status_penawaran": "draft"}, "quotation_items": _items()})
    with pytest.raises(ValidationError, match="ditandai terkirim"):
        await QuotationService(db).simpan_keputusan(  # type: ignore[arg-type]
            "q1", SimpanKeputusanRequest(items=[KeputusanItemInput(item_id="i1", keputusan="deal")])
        )


async def test_deal_langsung_di_level_penawaran_ditolak() -> None:
    with pytest.raises(ValidationError, match="per item"):
        await QuotationService(_Db({})).set_status("q1", SetQuotationStatusRequest(status="deal"))  # type: ignore[arg-type]


def _job(**kw: Any) -> JobCreate:
    # Hanya kolom penawaran yang diperiksa di sini — validasi field lain dilewati.
    return JobCreate.model_construct(**kw)


async def test_job_dari_item_ditolak_tidak_boleh() -> None:
    db = _Db(
        {
            "quotation_items": {"id": "i3", "quotation_id": "q1", "keputusan": "ditolak"},
            "quotations": {"status_penawaran": "deal", "quote_number": "0001/SK"},
        }
    )
    with pytest.raises(ValidationError, match="disetujui"):
        await JobService(db)._item_penawaran(_job(quotation_item_id="i3"))  # type: ignore[arg-type]


async def test_job_dari_item_deal_menyimpan_item_id() -> None:
    db = _Db(
        {
            "quotation_items": {"id": "i1", "quotation_id": "q1", "keputusan": "deal"},
            "quotations": {"status_penawaran": "deal", "quote_number": "0001/SK"},
        }
    )
    assert await JobService(db)._item_penawaran(_job(quotation_item_id="i1")) == ("q1", "i1")  # type: ignore[arg-type]


async def test_job_dari_penawaran_multi_item_wajib_pilih_item() -> None:
    db = _Db({"quotation_items": [{"id": "i1"}, {"id": "i2"}]})
    with pytest.raises(ValidationError, match="pilih item"):
        await JobService(db)._item_penawaran(_job(quotation_id="q1"))  # type: ignore[arg-type]


async def test_daftar_menghitung_item_deal_termasuk_revisi() -> None:
    q = {
        "id": "q1",
        "quote_number": "0840/SK/MAS/IX/2026",
        "seq_no": 840,
        "seq_tahun": 2026,
        "customer_id": "c1",
        "customer_nama": "PT Hexindo",
        "kota_terbit": "Pekanbaru",
        "tanggal": "2026-09-30",
        "perihal": "Surat Penawaran",
        "status_penawaran": "deal",
        "created_at": "2026-09-30T00:00:00+00:00",
        "updated_at": "2026-09-30T00:00:00+00:00",
        "quotation_items": [
            {"id": "i1", "keputusan": "deal", "harga_revisi": None, "subtotal": 7_500_000, "subtotal_final": 7_500_000},
            {
                "id": "i2",
                "keputusan": "deal",
                "harga_revisi": 6_000_000,
                "subtotal": 7_000_000,
                "subtotal_final": 6_000_000,
            },
            {
                "id": "i3",
                "keputusan": "ditolak",
                "harga_revisi": None,
                "subtotal": 5_000_000,
                "subtotal_final": 5_000_000,
            },
        ],
        "jobs": [],
    }
    [baris] = await QuotationService(_Db({"quotations": [q]})).list_all()  # type: ignore[arg-type]
    assert (baris.jumlah_item_deal, baris.jumlah_item_deal_revisi) == (2, 1)
    # Nilai deal memakai harga revisi bila ada.
    assert baris.nilai_deal == 13_500_000
    assert (baris.jumlah_item_ditolak, baris.nilai_item_ditolak) == (1, 5_000_000)
    assert (baris.jumlah_item_menunggu, baris.nilai_item_menunggu) == (0, 0)


async def test_tandai_terkirim_ditolak_bila_masa_berlaku_lewat() -> None:
    svc = QuotationService(_Db({"quotations": {"berlaku_sampai": "2000-01-01"}}))  # type: ignore[arg-type]
    with pytest.raises(ValidationError, match="Ubah tanggal Berlaku sampai"):
        await svc.set_status("q1", SetQuotationStatusRequest(status="terkirim"))


def _revisi(tanggal: str = "2026-10-01", berlaku: str = "2026-10-15") -> SuratRevisiRequest:
    return SuratRevisiRequest.model_validate({"tanggal": tanggal, "berlaku_sampai": berlaku})


async def test_surat_revisi_menyimpan_tanggal_dan_masa_berlaku_asli() -> None:
    db = _Db(
        {
            "quotations": {"status_penawaran": "deal", "berlaku_sampai": "2026-09-15", "berlaku_sampai_asli": None},
            "quotation_items": [{"id": "i1"}],
        }
    )
    await QuotationService(db).simpan_surat_revisi("q1", _revisi())  # type: ignore[arg-type]
    [langkah] = db.langkah
    assert langkah["data"] == {
        "tanggal_revisi": "2026-10-01",
        "berlaku_sampai": "2026-10-15",
        # Masa berlaku surat asli disimpan sekali.
        "berlaku_sampai_asli": "2026-09-15",
    }


async def test_surat_revisi_kedua_kali_tidak_menimpa_masa_berlaku_asli() -> None:
    db = _Db(
        {
            "quotations": {
                "status_penawaran": "deal",
                "berlaku_sampai": "2026-10-15",
                "berlaku_sampai_asli": "2026-09-15",
            },
            "quotation_items": [{"id": "i1"}],
        }
    )
    await QuotationService(db).simpan_surat_revisi("q1", _revisi("2026-10-05", "2026-10-30"))  # type: ignore[arg-type]
    assert db.langkah[0]["data"]["berlaku_sampai_asli"] == "2026-09-15"


async def test_surat_revisi_ditolak_tanpa_harga_revisi_atau_saat_draft() -> None:
    tanpa_revisi = _Db(
        {"quotations": {"status_penawaran": "deal", "berlaku_sampai": "2026-09-15"}, "quotation_items": []}
    )
    with pytest.raises(ValidationError, match="Belum ada harga item yang direvisi"):
        await QuotationService(tanpa_revisi).simpan_surat_revisi("q1", _revisi())  # type: ignore[arg-type]
    draft = _Db(
        {"quotations": {"status_penawaran": "draft", "berlaku_sampai": "2026-09-15"}, "quotation_items": [{"id": "i1"}]}
    )
    with pytest.raises(ValidationError, match="sudah terkirim atau deal"):
        await QuotationService(draft).simpan_surat_revisi("q1", _revisi())  # type: ignore[arg-type]


def test_surat_revisi_berlaku_harus_setelah_tanggal() -> None:
    with pytest.raises(Exception, match="Berlaku sampai harus setelah tanggal surat revisi"):
        _revisi("2026-10-01", "2026-10-01")


async def test_buka_kembali_mengembalikan_masa_berlaku_asli() -> None:
    db = _Db({"quotations": {"berlaku_sampai_asli": "2026-09-15"}})
    await QuotationService(db).set_status("q1", SetQuotationStatusRequest(status="draft"))  # type: ignore[arg-type]
    header = db.langkah[0]["data"]
    assert header["tanggal_revisi"] is None
    assert (header["berlaku_sampai"], header["berlaku_sampai_asli"]) == ("2026-09-15", None)


async def test_detail_menyertakan_nama_pemutus_item_dan_pengatur_berlaku() -> None:
    k1, k2 = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
    row = {
        "id": "q1",
        "quote_number": "0840/SK/MAS/IX/2026",
        "seq_no": 840,
        "seq_tahun": 2026,
        "customer_id": "c1",
        "customer_nama": "PT Hexindo",
        "kota_terbit": "Pekanbaru",
        "tanggal": "2026-09-01",
        "berlaku_sampai": "2026-10-15",
        "perihal": "Surat Penawaran",
        "status_penawaran": "deal",
        "berlaku_diatur_oleh": k2,
        "berlaku_diatur_at": "2026-10-01T02:00:00+00:00",
        "tanggal_revisi": "2026-10-01",
        "revisi_dibuat_oleh": k2,
        "revisi_dibuat_at": "2026-10-01T02:00:00+00:00",
        "created_at": "2026-09-01T00:00:00+00:00",
        "updated_at": "2026-09-01T00:00:00+00:00",
    }
    item = {
        "id": "i1",
        "quotation_id": "q1",
        "urutan": 1,
        "dari": "Pekanbaru",
        "tujuan": "Dumai",
        "qty": 1,
        "satuan": "Unit",
        "harga_satuan": 7_500_000,
        "subtotal": 7_500_000,
        "keputusan": "deal",
        "harga_revisi": 7_000_000,
        "subtotal_final": 7_000_000,
        "diputuskan_oleh": k1,
    }
    db = _Db(
        {
            "quotations": row,
            "quotation_items": [item],
            "jobs": [],
            "__rpc__nama_karyawan": [{"id": k1, "nama": "Mega"}, {"id": k2, "nama": "Rika"}],
        }
    )
    q = await QuotationService(db).get("q1")  # type: ignore[arg-type]
    assert (q.items[0].diputuskan_oleh, q.items[0].diputuskan_oleh_nama) == (k1, "Mega")
    assert (q.berlaku_diatur_oleh, q.berlaku_diatur_oleh_nama) == (k2, "Rika")
    assert (q.revisi_dibuat_oleh_nama, q.revisi_dibuat_at) == ("Rika", "2026-10-01T02:00:00+00:00")
    # Satu panggilan untuk semua nama pelaku.
    assert db.rpc_calls == [("nama_karyawan", {"p_ids": [k1, k2]})]


async def test_cetak_dicatat_di_log_sistem() -> None:
    db = _Db({})
    await QuotationService(db).catat_cetak("q1", "revisi")  # type: ignore[arg-type]
    assert db.rpc_calls == [("catat_cetak_penawaran", {"p_quotation_id": "q1", "p_versi": "revisi"})]

"""Penawaran: keputusan deal / tolak per item, revisi harga, dan job per item deal."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.jobs.schemas import JobCreate
from app.modules.jobs.service import JobService
from app.modules.quotations.schemas import KeputusanItemInput, SetQuotationStatusRequest, SimpanKeputusanRequest
from app.modules.quotations.service import QuotationService, status_dari_keputusan


class _Db:
    """Fake PostgREST: data per tabel; langkah transaksi (rpc) direkam."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data
        self.tabel = ""
        self.langkah: list[dict[str, Any]] = []

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

    def rpc(self, _nama: str, params: dict[str, Any]) -> "_Db":
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

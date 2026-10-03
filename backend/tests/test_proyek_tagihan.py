"""Detail proyek: daftar tagihan yang pernah dibuat (termasuk batal), urut
dibuat paling awal, nominal hanya untuk superadmin/finance."""

from types import SimpleNamespace
from typing import Any

from app.modules.proyek.service import ProyekService


def _inv(id_: str, nomor: str, dibuat: str, status: str = "terkirim", **kw: Any) -> dict[str, Any]:
    return {
        "invoice": {
            "id": id_, "invoice_number": nomor, "tanggal": dibuat[:10], "created_at": dibuat,
            "status_tagihan": status, "jatuh_tempo": None, "total": 1_110_000, "dibayar": 0,
            "alasan_batal": None, **kw,
        },
        "job": {"proyek_id": "p1"},
    }  # fmt: skip


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, _: str) -> "_Db":
        return self

    def select(self, *_: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


def _svc(data: list[dict[str, Any]]) -> ProyekService:
    svc = ProyekService.__new__(ProyekService)
    svc._db = _Db(data)  # type: ignore[assignment]
    return svc


async def test_urut_dibuat_termasuk_batal_dan_tanpa_duplikat() -> None:
    data = [
        # Tagihan baru (setelah yang lama dibatalkan) — dua job, muncul dua kali.
        _inv("i2", "INV/002", "2026-02-01T08:00:00+00:00", dibayar=555_000),
        _inv("i2", "INV/002", "2026-02-01T08:00:00+00:00", dibayar=555_000),
        _inv("i1", "INV/001", "2026-01-10T08:00:00+00:00", status="batal", alasan_batal="Salah harga"),
    ]
    hasil = await _svc(data)._tagihan("p1", lengkap=True)
    assert [t.invoice_number for t in hasil] == ["INV/001", "INV/002"]
    batal, aktif = hasil
    assert (batal.status_tampil, batal.alasan_batal) == ("batal", "Salah harga")
    assert (aktif.status_bayar, aktif.total, aktif.dibayar, aktif.sisa) == ("partial_paid", 1_110_000, 555_000, 555_000)


async def test_admin_tanpa_nominal() -> None:
    hasil = await _svc([_inv("i1", "INV/001", "2026-01-10T08:00:00+00:00")])._tagihan("p1", lengkap=False)
    assert (hasil[0].invoice_number, hasil[0].status_bayar) == ("INV/001", "unpaid")
    assert (hasil[0].total, hasil[0].dibayar, hasil[0].sisa) == (None, None, None)


async def test_belum_pernah_ditagih_kosong() -> None:
    assert await _svc([])._tagihan("p1", lengkap=True) == []

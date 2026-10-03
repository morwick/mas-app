"""Proyek: induk job (customer & PIC lapangan) — proyek baru + semua jobnya
satu transaksi, customer boleh kosong (unit jalan kosongan), job wajib masuk
proyek, satu proyek hanya satu tagihan."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.core.paging import PageParams
from app.modules.invoices.service import InvoiceService
from app.modules.jobs.schemas import JobCreate
from app.modules.jobs.service import JobService
from app.modules.proyek.schemas import ProyekCreate, ProyekUpdate
from app.modules.proyek.service import ProyekService


def _job(**ubah: Any) -> JobCreate:
    data: dict[str, Any] = {
        "alat_diangkut": "Excavator",
        "asal": "Pekanbaru",
        "tujuan": "Dumai",
        "unit_id": "u1",
        "driver_id": "d1",
        "etd": "2099-01-01T08:00:00+07:00",
        "uang_jalan_awal": 500000,
    }
    data.update(ubah)
    return JobCreate(**data)


class _Query:
    """Builder PostgREST tiruan: setiap tabel mengembalikan data yang disiapkan."""

    def __init__(self, data: Any) -> None:
        self.data = data

    def __getattr__(self, _nama: str) -> Any:
        return lambda *_a, **_k: self

    @property
    def not_(self) -> "_Query":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data, count=None)


class _Db:
    def __init__(self, tabel: dict[str, Any] | None = None, rpc: Any = None) -> None:
        self.tabel = tabel or {}
        self.hasil_rpc = rpc
        self.rpc_dipanggil: list[tuple[str, dict[str, Any]]] = []

    def table(self, nama: str) -> _Query:
        return _Query(self.tabel.get(nama, []))

    def rpc(self, nama: str, params: dict[str, Any]) -> _Query:
        self.rpc_dipanggil.append((nama, params))
        return _Query(self.hasil_rpc)


# ── Validasi isian ──────────────────────────────────────────────────────────


def test_customer_boleh_kosong_untuk_unit_jalan_kosongan() -> None:
    proyek = ProyekCreate(jobs=[_job()])
    assert proyek.customer_id is None and proyek.pic_nama is None


def test_pic_opsional_walau_customer_dipilih() -> None:
    proyek = ProyekCreate(customer_id="c1", pic_nama=" ", jobs=[_job()])
    assert proyek.pic_nama is None and proyek.pic_no_hp is None
    with pytest.raises(ValueError, match="Format No HP PIC"):
        ProyekCreate(customer_id="c1", pic_nama="Budi", pic_no_hp="12345", jobs=[_job()])


def test_proyek_baru_wajib_berisi_job() -> None:
    with pytest.raises(ValueError):
        ProyekCreate(jobs=[])


async def test_job_tanpa_proyek_ditolak() -> None:
    with pytest.raises(ValidationError, match="Job wajib masuk proyek"):
        await JobService(_Db()).create(_job(), created_by="p1")  # type: ignore[arg-type]


# ── Simpan: satu transaksi ──────────────────────────────────────────────────


def _pasang_tiruan(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    async def siapkan(self: JobService, payloads: list[JobCreate], *, created_by: str | None) -> list[dict[str, Any]]:
        return [{"alat_diangkut": p.alat_diangkut} for p in payloads]

    dikabari: list[str] = []

    async def kabari(self: JobService, row: dict[str, Any], payload: JobCreate) -> None:
        dikabari.append(row["job_number"])

    monkeypatch.setattr(JobService, "siapkan_banyak", siapkan)
    monkeypatch.setattr(JobService, "kabari_driver", kabari)
    return dikabari


async def test_proyek_baru_dan_semua_jobnya_satu_transaksi(monkeypatch: pytest.MonkeyPatch) -> None:
    dikabari = _pasang_tiruan(monkeypatch)
    db = _Db(
        rpc=[
            [{"id": "pr1", "nomor_proyek": "001/PRJ/MAS/X/2026"}],
            [{"id": "j1", "job_number": "JOB-2026-010", "share_token": "t"}],
            [{"id": "j2", "job_number": "JOB-2026-011", "share_token": "u"}],
        ]
    )

    hasil = await ProyekService(db).create(  # type: ignore[arg-type]
        ProyekCreate(customer_id="c1", pic_nama=" Budi ", pic_no_hp="08123456789", jobs=[_job(), _job()]),
        created_by="p1",
    )

    # Satu panggilan jalankan_transaksi: proyek dulu, lalu job-job yang merujuk id proyek.
    assert len(db.rpc_dipanggil) == 1
    nama, params = db.rpc_dipanggil[0]
    assert nama == "jalankan_transaksi"
    langkah = params["p_langkah"]
    assert [(lk["op"], lk["tabel"]) for lk in langkah] == [
        ("insert", "proyek"),
        ("insert", "jobs"),
        ("insert", "jobs"),
    ]
    assert langkah[0]["data"] == {
        "customer_id": "c1",
        "pic_nama": "Budi",
        "pic_no_hp": "08123456789",
        "created_by": "p1",
    }
    assert all(lk["data"]["proyek_id"] == "{{0.id}}" for lk in langkah[1:])
    assert "customer_id" not in langkah[1]["data"]  # customer hanya di proyek
    assert hasil.nomor_proyek == "001/PRJ/MAS/X/2026"
    assert [j.job_number for j in hasil.jobs] == ["JOB-2026-010", "JOB-2026-011"]
    assert dikabari == ["JOB-2026-010", "JOB-2026-011"]  # driver dikabari setelah tersimpan


async def test_ubah_proyek_dan_tambah_job_satu_transaksi(monkeypatch: pytest.MonkeyPatch) -> None:
    dikabari = _pasang_tiruan(monkeypatch)
    db = _Db(rpc=[[{"id": "pr1"}], [{"id": "j3", "job_number": "JOB-2026-012", "share_token": "v"}]])

    hasil = await ProyekService(db).update(  # type: ignore[arg-type]
        "pr1", ProyekUpdate(pic_nama="Siti", pic_no_hp="081299998888", jobs_baru=[_job()]), created_by="p1"
    )

    langkah = db.rpc_dipanggil[0][1]["p_langkah"]
    assert [(lk["op"], lk["tabel"]) for lk in langkah] == [("update", "proyek"), ("insert", "jobs")]
    assert langkah[0]["filter"] == {"id": "pr1"} and langkah[0]["wajib"] is True
    assert langkah[1]["data"]["proyek_id"] == "pr1"
    assert [j.job_number for j in hasil.jobs_baru] == ["JOB-2026-012"]
    assert dikabari == ["JOB-2026-012"]


async def test_job_dalam_satu_form_tidak_boleh_saling_bentrok(monkeypatch: pytest.MonkeyPatch) -> None:
    """Dua job baru di form yang sama memakai unit yang sama di jam yang sama."""

    async def tanpa_job_aktif(self: JobService, **_: Any) -> list[Any]:
        return []

    async def tanpa_rute(*_: Any) -> None:
        return None

    monkeypatch.setattr(JobService, "list_all", tanpa_job_aktif)
    monkeypatch.setattr("app.modules.jobs.service.try_get_route", tanpa_rute)
    job = _job(eta="2099-01-01T12:00:00+07:00")
    with pytest.raises(Exception, match="bentrok"):
        await JobService(_Db()).siapkan_banyak([job, job], created_by="p1")  # type: ignore[arg-type]


# ── Daftar ──────────────────────────────────────────────────────────────────


async def test_daftar_proyek_paging_di_server() -> None:
    db = _Db(
        rpc=[
            {
                "id": "pr1",
                "nomor_proyek": "001/PRJ/MAS/X/2026",
                "customer_id": None,
                "created_at": "2026-10-01T00:00:00Z",
                "jumlah_job": 2,
                "invoice_id": None,
                "total": 31,
            }
        ]
    )
    page = await ProyekService(db).list_page(  # type: ignore[arg-type]
        params=PageParams(page=3, page_size=10), q=" PLTU ", bulan=10, tahun=2026, status_tagih="belum",
        status_proyek="aktif",
    )
    _, params = db.rpc_dipanggil[0]
    assert params["p_tanpa_customer"] is False
    assert params["p_limit"] == 10 and params["p_offset"] == 20
    assert params["p_q"] == "PLTU" and params["p_status_tagih"] == "belum"
    assert params["p_status_proyek"] == "aktif"
    assert page.total == 31 and page.items[0].jumlah_job == 2
    assert page.items[0].customer_id is None  # proyek kosongan


async def test_proyek_per_unit_paging_per_unit_di_server() -> None:
    db = _Db(
        rpc=[
            {
                "unit_id": "u1",
                "kode_unit": "TH06",
                "no_polisi": "BM 9059 AO",
                "jenis_unit_nama": "Tronton",
                "jobs": [
                    {
                        "job_id": "j1",
                        "job_number": "JOB-2026-001",
                        "proyek_id": "pr1",
                        "nomor_proyek": "001/PRJ/MAS/X/2026",
                        "customer_nama": None,
                        "tujuan": "Dumai",
                        "etd": "2026-10-01T23:00:00+00:00",
                        "tanggal_muat": "2026-10-02T01:00:00+00:00",
                        "tanggal_bongkar": None,
                        "dibatalkan": False,
                    }
                ],
                "total": 14,
            },
            {
                "unit_id": "u2",
                "kode_unit": "TH07",
                "no_polisi": "BM 1",
                "jenis_unit_nama": None,
                "jobs": [],
                "total": 14,
            },
        ]
    )
    page = await ProyekService(db).per_unit(  # type: ignore[arg-type]
        params=PageParams(page=2, page_size=10), q=" TH ", bulan=10, tahun=2026, status_proyek="aktif"
    )
    _, params = db.rpc_dipanggil[0]
    assert params["p_q"] == "TH" and params["p_status_proyek"] == "aktif"
    assert params["p_limit"] == 10 and params["p_offset"] == 10
    assert params["p_bulan"] == 10 and params["p_tahun"] == 2026
    assert page.total == 14
    assert page.items[0].jobs[0].customer_nama is None  # kosongan
    assert page.items[0].jobs[0].job_number == "JOB-2026-001"
    assert page.items[1].jobs == []  # diteruskan apa adanya dari database


# ── Satu proyek = satu tagihan ──────────────────────────────────────────────


class _DbTagihan:
    """Tabel jobs → proyek job; invoice_items → tagihan aktif proyek itu."""

    def __init__(self, invoice_id: str) -> None:
        self.invoice_id = invoice_id

    def table(self, nama: str) -> _Query:
        if nama == "jobs":
            return _Query([{"proyek_id": "pr1", "proyek": {"nomor_proyek": "001/PRJ/MAS/X/2026"}}])
        return _Query(
            [{"invoice_id": self.invoice_id, "job": {"proyek_id": "pr1"}, "invoice": {"invoice_number": "0005/INV"}}]
        )


async def test_proyek_sudah_di_tagihan_lain_ditolak() -> None:
    with pytest.raises(ValidationError, match="Proyek 001/PRJ/MAS/X/2026 sudah ditagihkan di tagihan 0005/INV"):
        await InvoiceService(_DbTagihan("inv-lain"))._cek_proyek_satu_tagihan(  # type: ignore[arg-type]
            ["j2"], kecuali_invoice="inv-ini"
        )


async def test_job_lain_proyek_sama_boleh_di_tagihan_yang_sama() -> None:
    await InvoiceService(_DbTagihan("inv-ini"))._cek_proyek_satu_tagihan(  # type: ignore[arg-type]
        ["j2"], kecuali_invoice="inv-ini"
    )


# ── Aturan gabung proyek: 1 unit + 1 penawaran ──────────────────────────────


async def test_proyek_baru_semua_job_harus_satu_unit() -> None:
    with pytest.raises(ValidationError, match="unit yang sama"):
        await ProyekService(_Db()).create(  # type: ignore[arg-type]
            ProyekCreate(jobs=[_job(unit_id="u1"), _job(unit_id="u2")]), created_by="p1"
        )


async def test_proyek_baru_semua_job_harus_satu_penawaran() -> None:
    with pytest.raises(ValidationError, match="penawaran yang sama"):
        await ProyekService(_Db()).create(  # type: ignore[arg-type]
            ProyekCreate(jobs=[_job(quotation_id="q1"), _job(quotation_id="q2")]), created_by="p1"
        )


async def test_gabung_ke_proyek_unit_beda_ditolak() -> None:
    db = _Db({"jobs": [{"unit_id": "u1", "quotation_id": None, "proyek": {"nomor_proyek": "001/PRJ/MAS/X/2026"}}]})
    with pytest.raises(ValidationError, match="Unit job harus sama dengan unit proyek 001/PRJ/MAS/X/2026"):
        await ProyekService(db).update(  # type: ignore[arg-type]
            "pr1", ProyekUpdate(jobs_baru=[_job(unit_id="u9")]), created_by="p1"
        )


async def test_gabung_ke_proyek_penawaran_beda_ditolak() -> None:
    db = _Db({"jobs": [{"unit_id": "u1", "quotation_id": "q1", "proyek": {"nomor_proyek": "001/PRJ/MAS/X/2026"}}]})
    with pytest.raises(ValidationError, match="penawarannya berbeda"):
        await ProyekService(db).update(  # type: ignore[arg-type]
            "pr1", ProyekUpdate(jobs_baru=[_job(unit_id="u1")]), created_by="p1"
        )


async def test_cari_proyek_untuk_penawaran_dan_unit() -> None:
    db = _Db({"jobs": [{"proyek_id": "pr1", "proyek": {"id": "pr1", "nomor_proyek": "001/PRJ/MAS/X/2026"}}]})
    hasil = await ProyekService(db).cari_untuk_penawaran("q1", "u1")  # type: ignore[arg-type]
    assert hasil is not None and hasil.nomor_proyek == "001/PRJ/MAS/X/2026"
    assert await ProyekService(_Db()).cari_untuk_penawaran("q1", "u1") is None  # type: ignore[arg-type]

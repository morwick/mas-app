"""Asuransi, polis, dan perintah kerja perbaikan.

Aturan database (trigger status aset, polis bentrok, nomor WO, dll.) diuji
di harness Postgres; di sini: hitungan, validasi, dan isi transaksi simpan.
"""

import json
from collections.abc import Iterator
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.sinkron_anak import sinkron_anak
from app.core.transaksi import Transaksi
from app.main import app
from app.modules.asuransi.schemas import AsuransiInput
from app.modules.perintah_kerja.laporan import hari_perbaikan
from app.modules.perintah_kerja.schemas import PerintahKerjaInput
from app.modules.perintah_kerja.tanggungan import hitung_tanggungan

# ── Tanggungan biaya ────────────────────────────────────────────────────────


def test_bukan_asuransi_seluruhnya_perusahaan() -> None:
    t = hitung_tanggungan(1_000_000, pelaksana="bengkel")
    assert (t.asuransi, t.perusahaan) == (0, 1_000_000)


def test_klaim_disetujui_dikurangi_own_risk() -> None:
    t = hitung_tanggungan(
        12_000_000, pelaksana="asuransi", status_klaim="disetujui", nilai_disetujui=10_000_000, own_risk=500_000
    )
    # Asuransi: 10 jt − 0,5 jt; perusahaan: own risk + 2 jt yang tidak disetujui.
    assert (t.asuransi, t.perusahaan, t.estimasi) == (9_500_000, 2_500_000, False)


def test_klaim_disetujui_tidak_melebihi_total() -> None:
    t = hitung_tanggungan(5_000_000, pelaksana="asuransi", status_klaim="dibayar", nilai_disetujui=9_000_000)
    assert (t.asuransi, t.perusahaan) == (5_000_000, 0)


def test_klaim_ditolak_seluruhnya_perusahaan() -> None:
    t = hitung_tanggungan(4_000_000, pelaksana="asuransi", status_klaim="ditolak", nilai_disetujui=3_000_000)
    assert (t.asuransi, t.perusahaan) == (0, 4_000_000)


def test_klaim_diajukan_adalah_estimasi() -> None:
    t = hitung_tanggungan(4_000_000, pelaksana="asuransi", status_klaim="survei", own_risk=300_000)
    assert (t.asuransi, t.perusahaan, t.estimasi) == (3_700_000, 300_000, True)


def test_own_risk_lebih_besar_dari_biaya() -> None:
    t = hitung_tanggungan(
        200_000, pelaksana="asuransi", status_klaim="disetujui", nilai_disetujui=200_000, own_risk=500_000
    )
    assert (t.asuransi, t.perusahaan) == (0, 200_000)


def test_hari_perbaikan_dipotong_periode() -> None:
    r = {"status_wo": "selesai", "tanggal": "2026-08-28", "jadwal_mulai": None, "tanggal_selesai": "2026-09-03"}
    assert hari_perbaikan(r, date(2026, 9, 1), date(2026, 9, 30), date(2026, 9, 30)) == 3
    assert hari_perbaikan({**r, "status_wo": "draft"}, date(2026, 9, 1), date(2026, 9, 30), date(2026, 9, 30)) == 0


# ── Validasi input ──────────────────────────────────────────────────────────


def _wo(**isi: Any) -> dict[str, Any]:
    return {"unit_id": "u1", "tanggal": "2026-09-30", "pelaksana": "internal", "mekanik": [{"mekanik_id": "m1"}], **isi}


def test_wo_wajib_satu_aset() -> None:
    with pytest.raises(ValidationError, match="tepat satu aset"):
        PerintahKerjaInput.model_validate(_wo(unit_trailer_id="t1"))


def test_wo_internal_wajib_mekanik_dan_penanggung_jawab_otomatis() -> None:
    with pytest.raises(ValidationError, match="minimal satu mekanik"):
        PerintahKerjaInput.model_validate(_wo(mekanik=[]))
    wo = PerintahKerjaInput.model_validate(_wo(mekanik=[{"mekanik_id": "m1"}, {"mekanik_id": "m2"}]))
    assert [m.is_penanggung_jawab for m in wo.mekanik] == [True, False]


def test_wo_bengkel_dan_asuransi_wajib_pilihannya() -> None:
    with pytest.raises(ValidationError, match="Pilih bengkel"):
        PerintahKerjaInput.model_validate(_wo(pelaksana="bengkel"))
    with pytest.raises(ValidationError, match="polis asuransi"):
        PerintahKerjaInput.model_validate(_wo(pelaksana="asuransi"))


def test_asuransi_pic_utama() -> None:
    dasar = {
        "nama": "Asuransi Sinar",
        "pic": [{"nama": "Andi", "no_hp": "08121234567"}, {"nama": "Budi", "no_hp": "0813 1234 567"}],
    }
    a = AsuransiInput.model_validate(dasar)
    assert [p.is_utama for p in a.pic] == [True, False]  # PIC pertama otomatis utama
    with pytest.raises(ValidationError, match="hanya boleh satu"):
        AsuransiInput.model_validate({**dasar, "pic": [{**p, "is_utama": True} for p in dasar["pic"]]})
    with pytest.raises(ValidationError, match="tidak valid"):
        AsuransiInput.model_validate({**dasar, "pic": [{"nama": "C", "no_hp": "12"}]})


def test_sinkron_anak_urutan_hapus_reset_ubah_tambah() -> None:
    tx = Transaksi(None)  # type: ignore[arg-type]
    sinkron_anak(
        tx,
        "asuransi_pic",
        "asuransi_id",
        "a1",
        {"p1", "p2"},
        [{"id": "p2", "nama": "B", "is_utama": True}, {"id": None, "nama": "C", "is_utama": False}],
        reset={"is_utama": False},
    )
    ops = [(s["op"], s.get("filter"), s.get("data")) for s in tx._langkah]
    assert ops == [
        ("hapus", {"id": "p1"}, None),
        ("update", {"id": "p2"}, {"is_utama": False}),
        ("update", {"id": "p2"}, {"nama": "B", "is_utama": True}),
        ("insert", None, {"asuransi_id": "a1", "nama": "C", "is_utama": False}),
    ]


# ── API dengan database palsu ───────────────────────────────────────────────


class _Query:
    def __init__(self, db: "_FakeDb", tabel: str) -> None:
        self.db, self.tabel = db, tabel
        self.langkah: list[tuple[str, Any]] = []

    def __getattr__(self, nama: str) -> Any:
        def rekam(*args: Any, **kwargs: Any) -> "_Query":
            self.langkah.append((nama, args))
            return self

        return rekam

    @property
    def not_(self) -> "_Query":
        return self

    async def execute(self) -> SimpleNamespace:
        data = self.db.data.get(self.tabel, [])
        if any(n == "maybe_single" for n, _ in self.langkah):
            return SimpleNamespace(data=data[0] if data else None, count=None)
        return SimpleNamespace(data=data, count=self.db.count.get(self.tabel, len(data)))


class _Rpc:
    def __init__(self, db: "_FakeDb", nama: str, params: dict[str, Any]) -> None:
        self.db, self.nama, self.params = db, nama, params

    async def execute(self) -> SimpleNamespace:
        self.db.rpc_calls.append((self.nama, self.params))
        if self.nama == "jalankan_transaksi":
            return SimpleNamespace(data=[[] for _ in self.params["p_langkah"]])
        return SimpleNamespace(data=self.db.rpc_data.get(self.nama, []))


class _FakeDb:
    def __init__(self) -> None:
        self.data: dict[str, list[dict[str, Any]]] = {}
        self.count: dict[str, int] = {}
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self.rpc_data: dict[str, list[dict[str, Any]]] = {}
        self.storage = SimpleNamespace()

    def table(self, nama: str) -> _Query:
        return _Query(self, nama)

    def rpc(self, nama: str, params: dict[str, Any] | None = None) -> _Rpc:
        return _Rpc(self, nama, params or {})

    def langkah_tx(self) -> list[dict[str, Any]]:
        return next(p["p_langkah"] for n, p in self.rpc_calls if n == "jalankan_transaksi")


@pytest.fixture
def db() -> Iterator[_FakeDb]:
    fake = _FakeDb()

    async def override() -> Any:
        yield fake

    app.dependency_overrides[user_client] = override
    app.dependency_overrides[superadmin_or_admin_client] = override
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


_POLIS = {
    "id": "pol1",
    "asuransi_id": "a1",
    "unit_id": "u1",
    "unit_trailer_id": None,
    "nomor_polis": "POL-1",
    "jenis_pertanggungan": "all_risk",
    "mulai": "2026-01-01",
    "berakhir": "2026-12-31",
    "own_risk": "500000",
    "asuransi": {"nama": "Asuransi Sinar", "pic": []},
}


def test_simpan_wo_satu_transaksi_dengan_total_dan_klaim(client: TestClient, db: _FakeDb) -> None:
    db.data["polis_asuransi"] = [_POLIS]
    db.data["perintah_kerja"] = []  # detail setelah simpan → 404 wajar di DB palsu
    payload = {
        "unit_id": "u1",
        "tanggal": "2026-09-30",
        "pelaksana": "asuransi",
        "polis_id": "pol1",
        "status_wo": "dikerjakan",
        "jasa": [{"uraian": "Ketok magic", "biaya": 1_500_000}],
        "sparepart": [{"nama": "Bumper", "qty": 2, "harga_satuan": 750_000}],
        "biaya_lain": [{"uraian": "Derek", "biaya": 250_000}],
    }
    client.post("/api/perintah-kerja", json=payload)
    langkah = db.langkah_tx()
    induk = langkah[0]
    assert (induk["op"], induk["tabel"]) == ("insert", "perintah_kerja")
    assert induk["data"]["total_jasa"] == 1_500_000
    assert induk["data"]["total_sparepart"] == 1_500_000
    assert induk["data"]["total_biaya"] == 3_250_000
    assert induk["data"]["status_wo"] == "dikerjakan"
    tabel = [s["tabel"] for s in langkah]
    assert tabel == [
        "perintah_kerja",
        "perintah_kerja_jasa",
        "perintah_kerja_sparepart",
        "perintah_kerja_biaya_lain",
        "klaim_asuransi",
    ]
    klaim = langkah[-1]["data"]
    assert klaim["own_risk"] == 500_000  # dari polis
    assert klaim["status_klaim"] == "diajukan"


def test_wo_asuransi_ditolak_bila_polis_tidak_berlaku(client: TestClient, db: _FakeDb) -> None:
    db.data["polis_asuransi"] = [_POLIS]
    payload = {"unit_id": "u1", "tanggal": "2027-02-01", "pelaksana": "asuransi", "polis_id": "pol1"}
    res = client.post("/api/perintah-kerja", json=payload)
    assert res.status_code == 422
    assert "tidak berlaku" in res.json()["detail"]
    assert not any(n == "jalankan_transaksi" for n, _ in db.rpc_calls)


def test_tambah_asuransi_dengan_pic_satu_transaksi(client: TestClient, db: _FakeDb) -> None:
    db.data["asuransi"] = []
    payload = {
        "nama": "Asuransi Sinar",
        "pic": [{"nama": "Andi", "no_hp": "081212345678"}],
        "bengkel_rekanan": [{"nama": "Bengkel A"}],
    }
    client.post("/api/asuransi", json=payload)
    tabel = [s["tabel"] for s in db.langkah_tx()]
    assert tabel == ["asuransi", "asuransi_pic", "asuransi_bengkel_rekanan"]
    assert db.langkah_tx()[1]["data"]["is_utama"] is True


def test_asuransi_berpolis_tidak_bisa_dihapus(client: TestClient, db: _FakeDb) -> None:
    db.count["polis_asuransi"] = 1
    res = client.delete("/api/asuransi/a1")
    assert res.status_code == 409
    assert "Nonaktifkan" in res.json()["detail"]


def test_tambah_unit_dengan_polis_satu_transaksi(client: TestClient, db: _FakeDb) -> None:
    db.data["asuransi"] = [{"id": "a1", "is_active": True}]
    db.data["units"] = []
    polis = {
        "asuransi_id": "a1",
        "nomor_polis": "POL-9",
        "mulai": "2026-01-01",
        "berakhir": "2026-12-31",
        "own_risk": 500000,
    }
    data = {"kode_unit": "sl29", "jenis_unit_id": "j1", "no_polisi": "B 1", "polis": polis}
    client.post("/api/units", data={"data": json.dumps(data)})
    langkah = db.langkah_tx()
    assert [s["tabel"] for s in langkah] == ["units", "polis_asuransi"]
    assert langkah[1]["data"]["unit_id"] == langkah[0]["data"]["id"]
    assert langkah[1]["data"]["nomor_polis"] == "POL-9"


def test_tambah_unit_tanpa_polis_tetap_seperti_biasa(client: TestClient, db: _FakeDb) -> None:
    db.data["units"] = []
    data = {"kode_unit": "sl30", "jenis_unit_id": "j1", "no_polisi": "B 2"}
    client.post("/api/units", data={"data": json.dumps(data)})
    assert not any(n == "jalankan_transaksi" for n, _ in db.rpc_calls)


def test_riwayat_perintah_kerja_mencegah_hapus_aset(client: TestClient, db: _FakeDb) -> None:
    db.rpc_data["ringkasan_riwayat_aset"] = [{"job": 0, "insiden": 0, "service": 0, "penjualan": 0, "penghapusan": 0}]
    db.count["perintah_kerja"] = 2
    body = client.get("/api/units/u1/riwayat").json()
    assert body["perbaikan"] == 2
    assert body["bisa_dihapus"] is False


def test_daftar_unit_dengan_polis_terkini(client: TestClient, db: _FakeDb) -> None:
    unit = {
        "id": "u1",
        "kode_unit": "SL-01",
        "jenis_unit_id": "j1",
        "no_polisi": "B 1",
        "status_operasional": "standby",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    db.data["units"] = [unit, {**unit, "id": "u2", "kode_unit": "SL-02"}]
    db.data["polis_asuransi"] = [
        {
            "id": "p1",
            "asuransi_id": "a1",
            "unit_id": "u1",
            "nomor_polis": "POL-1",
            "jenis_pertanggungan": "tlo",
            "mulai": "2000-01-01",
            "berakhir": "2999-12-31",
            "asuransi": {"nama": "Asuransi Sinar", "pic": []},
        }
    ]
    body = client.get("/api/units", params={"include_inactive": True, "dengan_polis": True}).json()
    assert body[0]["polis_terkini"]["asuransi_id"] == "a1"
    assert body[0]["polis_terkini"]["asuransi_nama"] == "Asuransi Sinar"
    assert body[1]["polis_terkini"] is None
    # Tanpa `dengan_polis` (dropdown form) polis tidak ikut diambil.
    assert client.get("/api/units").json()[0]["polis_terkini"] is None


def test_selesaikan_insiden_tanpa_perbaikan_lewat_fungsi_db(client: TestClient, db: _FakeDb) -> None:
    res = client.post("/api/incidents/i1/resolve-tanpa-perbaikan")
    assert res.status_code == 200
    # Satu panggilan fungsi DB = satu transaksi; status aset diatur trigger.
    assert db.rpc_calls == [("selesaikan_insiden_tanpa_perbaikan", {"p_incident_id": "i1"})]

"""Approval: master approver (superadmin) & menu / keputusan approver."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthContext, CurrentUser, require_auth, superadmin_client, user_client
from app.domain.uang_jalan import hitung_ringkasan
from app.main import app
from app.modules.uang_jalan.schemas import UangJalan


class _Db:
    """Fake Supabase: rpc & tabel merekam panggilan, mengembalikan `data`."""

    def __init__(self) -> None:
        self.data: Any = []
        self.panggilan: list[tuple[str, Any]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.panggilan.append((nama, params))
        return self

    def table(self, nama: str) -> "_Db":
        self.panggilan.append(("table", nama))
        return self

    def insert(self, data: Any) -> "_Db":
        self.panggilan.append(("insert", data))
        return self

    def update(self, data: Any) -> "_Db":
        self.panggilan.append(("update", data))
        return self

    def __getattr__(self, nama: str) -> Any:
        return lambda *a, **k: self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data, count=None)


@pytest.fixture
def db() -> Iterator[_Db]:
    fake = _Db()

    async def klien() -> Any:
        yield fake

    def auth() -> AuthContext:
        user = CurrentUser(id="u1", email="e", nama="Admin", initials="A", role="admin", allowed_jenis_unit_ids=None)
        return AuthContext(user=user, token="t")

    app.dependency_overrides[superadmin_client] = klien
    app.dependency_overrides[user_client] = klien
    app.dependency_overrides[require_auth] = auth
    yield fake
    app.dependency_overrides.clear()


def test_daftar_approver_paging_filter_diteruskan(client: TestClient, db: _Db) -> None:
    db.data = [
        {
            "id": "a1",
            "fitur_kode": "penjualan_aset",
            "fitur_nama": "Penjualan Unit & Unit Trailer",
            "mode": "semua",
            "karyawan_id": "k1",
            "karyawan_nama": "Andi",
            "urutan": 1,
            "karyawan_aktif": True,
            "total": 12,
        }
    ]
    res = client.get(
        "/api/approval/approver", params={"page": 2, "page_size": 10, "fitur": "penjualan_aset", "q": " and "}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 12 and body["items"][0]["karyawan_nama"] == "Andi"
    assert db.panggilan == [
        ("daftar_approver", {"p_fitur": "penjualan_aset", "p_q": "and", "p_limit": 10, "p_offset": 10})
    ]


def test_tambah_approver_mencatat_pembuat(client: TestClient, db: _Db) -> None:
    res = client.post(
        "/api/approval/approver", json={"fitur_kode": "tambahan_uang_jalan", "karyawan_id": "k2", "urutan": 2}
    )
    assert res.status_code == 201, res.text
    assert (
        "insert",
        {"fitur_kode": "tambahan_uang_jalan", "karyawan_id": "k2", "urutan": 2, "created_by": "u1"},
    ) in db.panggilan


def test_fitur_atau_mode_tidak_dikenal_ditolak(client: TestClient, db: _Db) -> None:
    assert client.post("/api/approval/approver", json={"fitur_kode": "x", "karyawan_id": "k"}).status_code == 422
    assert client.patch("/api/approval/fitur/penjualan_aset", json={"mode": "acak"}).status_code == 422
    assert db.panggilan == []


def test_menolak_wajib_alasan(client: TestClient, db: _Db) -> None:
    res = client.post("/api/approval/pengajuan/p1/putuskan", json={"setuju": False, "catatan": "  "})
    assert res.status_code == 422
    assert "Alasan penolakan wajib diisi" in res.json()["detail"]
    assert db.panggilan == []


def test_putuskan_memanggil_fungsi_database(client: TestClient, db: _Db) -> None:
    db.data = "disetujui"
    res = client.post("/api/approval/pengajuan/p1/putuskan", json={"setuju": True, "catatan": " oke "})
    assert res.status_code == 200, res.text
    assert res.json() == {"status_approval": "disetujui"}
    assert db.panggilan == [("putuskan_approval", {"p_pengajuan_id": "p1", "p_setuju": True, "p_catatan": "oke"})]


def test_daftar_pengajuan_dan_menu(client: TestClient, db: _Db) -> None:
    db.data = [
        {
            "id": "p1",
            "fitur_kode": "tambahan_uang_jalan",
            "ref_id": "u1",
            "judul": "Tambahan uang jalan JOB-001",
            "rincian": {"job_number": "JOB-001"},
            "nilai": 500000,
            "mode": "berjenjang",
            "status_approval": "menunggu",
            "diajukan_oleh_nama": "Admin",
            "diajukan_at": "2026-10-01T01:00:00+00:00",
            "giliran_saya": True,
            "langkah": [{"karyawan_id": "k1", "nama": "Andi", "urutan": 1, "keputusan": "menunggu"}],
            "total": 1,
        }
    ]
    res = client.get(
        "/api/approval/pengajuan",
        params={
            "fitur": "tambahan_uang_jalan",
            "hanya_giliran": True,
            "status": "menunggu",
            "tahun": 2026,
            "bulan": 10,
        },
    )
    assert res.status_code == 200, res.text
    item = res.json()["items"][0]
    assert item["giliran_saya"] is True and item["langkah"][0]["nama"] == "Andi"
    nama, params = db.panggilan[-1]
    assert nama == "daftar_pengajuan_approval"
    assert params["p_hanya_giliran"] is True and params["p_tahun"] == 2026 and params["p_bulan"] == 10

    db.data = [{"kode": "tambahan_uang_jalan", "nama": "Tambahan Uang Jalan", "menunggu_saya": 3}]
    assert client.get("/api/approval/menu").json() == [
        {"kode": "tambahan_uang_jalan", "nama": "Tambahan Uang Jalan", "menunggu_saya": 3}
    ]


def test_detail_pengajuan_satu_id_atau_404(client: TestClient, db: _Db) -> None:
    db.data = [
        {
            "id": "p1",
            "fitur_kode": "tambahan_uang_jalan",
            "ref_id": "u1",
            "judul": "Tambahan uang jalan JOB-001",
            "rincian": {},
            "nilai": 500000,
            "mode": "berjenjang",
            "status_approval": "menunggu",
            "diajukan_at": "2026-10-01T01:00:00+00:00",
            "giliran_saya": True,
            "langkah": [],
            "total": 1,
        }
    ]
    res = client.get("/api/approval/pengajuan/p1", params={"fitur": "tambahan_uang_jalan"})
    assert res.status_code == 200, res.text
    assert res.json()["id"] == "p1"
    nama, params = db.panggilan[-1]
    assert nama == "daftar_pengajuan_approval" and params["p_id"] == "p1" and params["p_hanya_giliran"] is False

    # Belum sampai giliran (mis. level 2 sebelum level 1 setuju) → tidak ditemukan.
    db.data = []
    assert client.get("/api/approval/pengajuan/p2", params={"fitur": "tambahan_uang_jalan"}).status_code == 404


def test_riwayat_approval_tambahan_uang_jalan(client: TestClient, db: _Db) -> None:
    db.data = [
        {
            "mode": "berjenjang",
            "status_approval": "disetujui",
            "alasan_tolak": None,
            "diajukan_oleh_nama": "Admin",
            "diajukan_at": "2026-10-01T01:00:00+00:00",
            "langkah": [
                {"karyawan_id": "k1", "nama": "Linda", "urutan": 1, "keputusan": "setuju", "catatan": "Oke"}
            ],
        }
    ]
    res = client.get("/api/approval/uang-jalan/u1")
    assert res.status_code == 200, res.text
    assert res.json()["langkah"][0]["catatan"] == "Oke"
    assert db.panggilan[-1] == ("riwayat_approval_uang_jalan", {"p_uang_jalan_id": "u1"})

    db.data = []
    assert client.get("/api/approval/uang-jalan/u2").status_code == 404


def test_ringkasan_uang_jalan_hanya_menghitung_tambahan_yang_disetujui() -> None:
    def uj(jenis: str, jumlah: int, status: str = "disetujui") -> UangJalan:
        return UangJalan(
            id="x", job_id="j", jenis=jenis, tanggal="2026-10-01", jumlah=jumlah, created_at="x", status_approval=status
        )  # type: ignore[arg-type]

    r = hitung_ringkasan(
        2_000_000,
        [
            uj("tambahan", 300_000),
            uj("tambahan", 500_000, "menunggu"),
            uj("tambahan", 900_000, "ditolak"),
            uj("pencairan", 1_000_000),
        ],
    )
    assert (r.uang_jalan, r.tambahan, r.tambahan_menunggu, r.sisa) == (2_300_000, 300_000, 500_000, 1_300_000)

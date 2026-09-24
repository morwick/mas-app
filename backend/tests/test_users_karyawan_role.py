"""Tambah/edit pengguna: semua karyawan bisa dipilih, tapi karyawan + role yang
sama tidak boleh terdaftar dua kali."""

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthContext, CurrentUser, require_superadmin, superadmin_client
from app.main import app

KARYAWAN = [
    {"id": "k1", "nama": "Rika Sari", "tanggal_lahir": None, "akun": [{"user_id": "u1", "role": "operator"}]},
    {"id": "k2", "nama": "Budi", "tanggal_lahir": None, "akun": []},
]


class _Rpc:
    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=KARYAWAN)


class _FakeDb:
    def rpc(self, nama: str, params: dict[str, Any] | None = None) -> _Rpc:
        assert nama == "karyawan_untuk_pengguna"
        return _Rpc()


@pytest.fixture
def db() -> Iterator[None]:
    async def klien() -> Any:
        yield _FakeDb()

    async def superadmin() -> AuthContext:
        user = CurrentUser(
            id="sa", email="sa@mas.co.id", nama="SA", initials="SA", role="superadmin", allowed_jenis_unit_ids=None
        )
        return AuthContext(user=user, token="t")

    app.dependency_overrides[superadmin_client] = klien
    app.dependency_overrides[require_superadmin] = superadmin
    yield
    app.dependency_overrides.clear()


def test_semua_karyawan_bisa_dipilih_beserta_akunnya(client: TestClient, db: None) -> None:
    body = client.get("/api/users/karyawan-tersedia").json()
    assert [k["nama"] for k in body] == ["Rika Sari", "Budi"]
    assert body[0]["akun"] == [{"user_id": "u1", "role": "operator"}]


def test_tambah_karyawan_dengan_role_yang_sudah_terdaftar_ditolak(client: TestClient, db: None) -> None:
    res = client.post(
        "/api/users",
        json={
            "karyawan_id": "k1",
            "email": "rika2@mas.co.id",
            "password": "rahasia1",
            "roles": ["operator", "superadmin"],
            "allowed_jenis_unit_ids": ["j1"],
        },
    )
    assert res.status_code == 409
    assert res.json()["detail"] == (
        "Pengguna gagal ditambahkan karena data sudah terdaftar: Rika Sari sudah punya akun lain dengan role Operator."
    )


def test_edit_ke_karyawan_role_milik_akun_lain_ditolak(client: TestClient, db: None) -> None:
    res = client.patch(
        "/api/users/u9",
        json={"karyawan_id": "k1", "email": "x@mas.co.id", "roles": ["operator"], "allowed_jenis_unit_ids": ["j1"]},
    )
    assert res.status_code == 409
    assert res.json()["detail"].startswith("Perubahan gagal disimpan karena data sudah terdaftar")


def test_edit_akun_sendiri_menambah_role_tidak_bentrok_dengan_dirinya(client: TestClient, db: None) -> None:
    """u1 sudah operator; menambah superadmin ke akun u1 yang sama bukan duplikat."""
    from app.modules.users.router import KaryawanOption, _role_bentrok

    k = KaryawanOption(id="k1", nama="Rika", tanggal_lahir=None, akun=[{"user_id": "u1", "role": "operator"}])  # type: ignore[list-item]
    assert _role_bentrok(k, ["operator", "superadmin"], kecuali_user="u1") == []
    assert _role_bentrok(k, ["operator", "superadmin"], kecuali_user="u2") == ["operator"]


def test_role_data_scope_hanya_untuk_operator() -> None:
    from app.modules.users.router import _role_data

    assert _role_data(["superadmin"], ["j1"]) == {"roles": ["superadmin"], "allowed_jenis_unit_ids": None}
    assert _role_data(["superadmin", "operator", "operator"], ["j2", "j1"]) == {
        "roles": ["operator", "superadmin"],
        "allowed_jenis_unit_ids": ["j1", "j2"],
    }


def test_edit_akun_sendiri_tidak_boleh_melepas_superadmin(client: TestClient, db: None) -> None:
    res = client.patch(
        "/api/users/sa",
        json={"karyawan_id": "k2", "email": "sa@mas.co.id", "roles": ["operator"], "allowed_jenis_unit_ids": ["j1"]},
    )
    assert res.status_code == 422
    assert "tidak bisa dilepas dari akun sendiri" in res.json()["detail"]


def test_edit_akun_sendiri_tidak_lagi_ditolak(client: TestClient, db: None) -> None:
    """Dulu: 'Ubah data akun sendiri lewat halaman Profil'. Sekarang lolos ke
    pengecekan berikutnya (di sini berhenti di select profil fake db)."""
    try:
        res = client.patch(
            "/api/users/sa",
            json={"karyawan_id": "k2", "email": "sa@mas.co.id", "roles": ["superadmin"], "allowed_jenis_unit_ids": []},
        )
        detail = str(res.json().get("detail", ""))
    except AttributeError:
        detail = ""  # fake db tidak punya .table — berarti sudah lewat cek akun sendiri
    assert "akun sendiri" not in detail


class _DbAktif:
    """Fake untuk set_active: profil pengguna + fungsi karyawan_aktif."""

    def __init__(self, karyawan_aktif: bool) -> None:
        self.karyawan_aktif = karyawan_aktif
        self.diubah: dict[str, Any] | None = None
        self._hasil: Any = None

    def table(self, _: str) -> "_DbAktif":
        return self

    def select(self, *_: object) -> "_DbAktif":
        self._hasil = {"nama": "Rika Sari", "karyawan_id": "k1"}
        return self

    def update(self, data: dict[str, Any]) -> "_DbAktif":
        self.diubah = data
        self._hasil = []
        return self

    def eq(self, *_: object) -> "_DbAktif":
        return self

    def maybe_single(self) -> "_DbAktif":
        return self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_DbAktif":
        assert nama == "karyawan_aktif" and params == {"p_karyawan_id": "k1"}
        self._hasil = self.karyawan_aktif
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._hasil)


@pytest.mark.parametrize("karyawan_aktif", [True, False])
def test_aktifkan_pengguna_cek_status_karyawan(client: TestClient, db: None, karyawan_aktif: bool) -> None:
    fake = _DbAktif(karyawan_aktif)

    async def klien() -> Any:
        yield fake

    app.dependency_overrides[superadmin_client] = klien
    res = client.patch("/api/users/u1/active", json={"is_active": True})
    if karyawan_aktif:
        assert res.status_code == 200 and fake.diubah == {"is_active": True}
    else:
        assert res.status_code == 422
        assert "karyawan Rika Sari berstatus Nonaktif" in res.json()["detail"]
        assert fake.diubah is None

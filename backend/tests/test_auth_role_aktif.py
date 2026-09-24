"""Identitas backend hanya berdasarkan role aktif yang dikonfirmasi database."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core import auth
from app.core.errors import UnauthorizedError


class _Client:
    def __init__(self, profil: dict[str, Any] | None) -> None:
        self.profil = profil
        self.auth = SimpleNamespace(get_user=self._get_user)

    async def _get_user(self, _token: str) -> SimpleNamespace:
        return SimpleNamespace(user=SimpleNamespace(id="u-sa", email="sa@mas.co.id"))

    def rpc(self, nama: str) -> "_Client":
        assert nama == "profil_saya"
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[self.profil] if self.profil else [])


@pytest.mark.parametrize(
    "profil",
    [
        # Superadmin yang sudah dinonaktifkan: role_aktif() NULL.
        {"nama": "SA", "roles": ["superadmin"], "role_aktif": None, "is_active": False},
        # Sesi login sudah berakhir (logout) tapi token Supabase masih berlaku.
        {"nama": "SA", "roles": ["superadmin"], "role_aktif": None, "is_active": True},
        None,
    ],
)
async def test_tanpa_role_aktif_ditolak(profil: dict[str, Any] | None) -> None:
    with pytest.raises(UnauthorizedError):
        await auth.load_current_user(_Client(profil), f"token-{id(profil)}")  # type: ignore[arg-type]


async def test_role_aktif_superadmin_diterima() -> None:
    profil = {"nama": "SA", "roles": ["superadmin"], "role_aktif": "superadmin", "is_active": True}
    user = await auth.load_current_user(_Client(profil), "token-ok")  # type: ignore[arg-type]
    assert user.is_superadmin


def test_tanpa_role_aktif_tidak_pernah_superadmin() -> None:
    user = auth.build_current_user(user_id="1", email=None, profile={"roles": ["superadmin"], "role_aktif": None})
    assert user.role == "operator"

"""Ganti role aktif: hanya role yang dimiliki akun."""

import pytest

from app.core.auth import AuthContext, CurrentUser
from app.core.config import get_settings
from app.core.errors import ForbiddenError
from app.modules.auth.service import AuthService


def _auth(roles: list[str]) -> AuthContext:
    user = CurrentUser(
        id="u1",
        email="r@mas.co.id",
        nama="Rika",
        initials="R",
        role="operator",
        roles=roles,
        allowed_jenis_unit_ids=["j1"],  # type: ignore[arg-type]
    )
    return AuthContext(user=user, token="jwt")


async def test_role_yang_tidak_dimiliki_ditolak_tanpa_menyentuh_database() -> None:
    svc = AuthService(factory=None, settings=get_settings())  # type: ignore[arg-type]
    with pytest.raises(ForbiddenError):
        await svc.ganti_role(_auth(["operator"]), "superadmin")

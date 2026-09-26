"""Ganti role menerima semua role, termasuk finance & admin."""

import pytest

from app.modules.auth.schemas import GantiRoleRequest


@pytest.mark.parametrize("role", ["superadmin", "operator", "finance", "admin"])
def test_semua_role_diterima(role: str) -> None:
    assert GantiRoleRequest(role=role).role == role  # type: ignore[arg-type]

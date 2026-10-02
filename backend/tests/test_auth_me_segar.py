"""/auth/me membaca profil ulang (tanpa cache 60 detik): role yang baru
ditambahkan admin ke akun yang sedang login langsung terlihat."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core import auth as auth_mod


async def test_require_auth_segar_membuang_cache_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token = "tok-abc"
    lama = SimpleNamespace(roles=["admin"])
    auth_mod._IDENTITY_CACHE[auth_mod.hashlib.sha256(token.encode()).hexdigest()] = lama  # type: ignore[assignment]
    dipanggil: list[Any] = []

    async def require_auth_palsu(request: Any, factory: Any) -> Any:
        # Saat require_auth berjalan, cache token ini sudah dibuang.
        dipanggil.append(auth_mod._IDENTITY_CACHE.get(auth_mod.hashlib.sha256(token.encode()).hexdigest()))
        return "ok"

    monkeypatch.setattr(auth_mod, "require_auth", require_auth_palsu)
    request = SimpleNamespace(headers={"authorization": f"Bearer {token}"})
    assert await auth_mod.require_auth_segar(request, object()) == "ok"  # type: ignore[arg-type]
    assert dipanggil == [None]

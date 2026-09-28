"""Resolver link Google Maps: hanya host Google yang boleh dikunjungi."""

import httpx
import pytest

from app.core.errors import ValidationError
from app.integrations import google_maps_link as gml


@pytest.mark.parametrize(
    "host",
    ["maps.app.goo.gl", "goo.gl", "google.com", "www.google.co.id", "maps.google.com", "consent.google.com"],
)
def test_host_google_diizinkan(host: str) -> None:
    assert gml._host_diizinkan(host)


@pytest.mark.parametrize(
    "host",
    ["evil.com", "google.evil.com", "www.google.attacker.com", "notgoogle.com", "google.co.evil", "localhost"],
)
def test_host_lain_ditolak(host: str) -> None:
    assert not gml._host_diizinkan(host)


async def test_link_non_google_ditolak() -> None:
    with pytest.raises(ValidationError):
        await gml.resolve_link("http://169.254.169.254/latest")


def _pasang_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:  # type: ignore[no-untyped-def]
    asli = httpx.AsyncClient

    def buat(*args, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["transport"] = httpx.MockTransport(handler)
        return asli(*args, **kwargs)

    monkeypatch.setattr(gml.httpx, "AsyncClient", buat)


async def test_redirect_diikuti_sampai_url_akhir(monkeypatch: pytest.MonkeyPatch) -> None:
    akhir = "https://www.google.com/maps/place/X/@-6.1,106.8,17z"

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "maps.app.goo.gl":
            return httpx.Response(302, headers={"location": akhir})
        return httpx.Response(200, text="ok")

    _pasang_transport(monkeypatch, handler)
    assert await gml.resolve_link("https://maps.app.goo.gl/abc") == akhir


async def test_redirect_ke_host_lain_ditolak(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://10.0.0.1/admin"})

    _pasang_transport(monkeypatch, handler)
    with pytest.raises(ValidationError):
        await gml.resolve_link("https://maps.app.goo.gl/abc")


async def test_halaman_consent_ambil_url_continue(monkeypatch: pytest.MonkeyPatch) -> None:
    asli = "https://www.google.com/maps?q=-6.2,106.8"

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302, headers={"location": "https://consent.google.com/m?continue=" + httpx.QueryParams({"x": asli})["x"]}
        )

    _pasang_transport(monkeypatch, handler)
    assert await gml.resolve_link("https://maps.app.goo.gl/abc") == asli

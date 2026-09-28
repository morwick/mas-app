"""Buka link pendek Google Maps (maps.app.goo.gl, goo.gl/maps) jadi URL lengkap.

Link pendek hasil tombol "Bagikan" di HP tidak memuat koordinat — koordinatnya
baru terlihat di URL tujuan redirect. Browser tidak bisa mengikuti redirect itu
sendiri (CORS), jadi backend yang mengikutinya.

Hanya host Google yang boleh dikunjungi di setiap langkah redirect supaya
endpoint ini tidak bisa dipakai untuk menembak alamat lain (SSRF).
"""

from __future__ import annotations

from urllib.parse import parse_qs, urljoin, urlparse

import httpx

from app.core.errors import UpstreamError, ValidationError

TIMEOUT_S = 8.0
MAX_REDIRECT = 6

# Host yang boleh dikunjungi. Subdomain google.* (www.google.co.id, dll.) dicek terpisah.
_HOST_PENDEK = {"maps.app.goo.gl", "goo.gl", "g.co"}


def _host_diizinkan(host: str) -> bool:
    host = host.lower()
    if host in _HOST_PENDEK:
        return True
    # google.com, www.google.co.id, maps.google.com, consent.google.com, ...
    bagian = host.split(".")
    if "google" not in bagian:
        return False
    sisa = bagian[bagian.index("google") + 1 :]
    if len(sisa) == 1:
        return sisa[0].isalpha()
    return len(sisa) == 2 and sisa[0] in ("co", "com") and len(sisa[1]) == 2 and sisa[1].isalpha()


async def resolve_link(url: str) -> str:
    """Ikuti redirect link Google Maps dan kembalikan URL akhirnya."""
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _host_diizinkan(parsed.hostname or ""):
        raise ValidationError("Link bukan link Google Maps.")

    sekarang = url
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False) as http:
        for _ in range(MAX_REDIRECT):
            try:
                res = await http.get(sekarang, headers={"User-Agent": "Mozilla/5.0 (MAS-APP)"})
            except httpx.HTTPError as exc:
                raise UpstreamError("Gagal membuka link Google Maps. Coba lagi.") from exc

            lokasi = res.headers.get("location")
            if not res.is_redirect or not lokasi:
                return sekarang

            berikut = urljoin(sekarang, lokasi)
            p = urlparse(berikut)
            if p.scheme not in ("http", "https") or not _host_diizinkan(p.hostname or ""):
                raise ValidationError("Link Google Maps mengarah ke alamat yang tidak dikenal.")

            # Halaman persetujuan cookie Google membawa URL aslinya di ?continue=
            if (p.hostname or "").startswith("consent."):
                lanjut = parse_qs(p.query).get("continue", [None])[0]
                if lanjut:
                    return lanjut
            sekarang = berikut

    return sekarang

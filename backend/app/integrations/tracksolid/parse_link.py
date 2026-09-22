"""Ambil IMEI dari input bebas: IMEI mentah atau URL share link TrackSolid.

Contoh link:
  https://www.tracksolidpro.com/resource/dev/index.html?t=247132#/monitorTracking?imei=353701093101554
Parameter bisa berada di fragment (#/path?imei=...), jadi URL parser saja tidak
cukup — seluruh string dipindai dengan regex.
"""

from __future__ import annotations

import re

from pydantic import BaseModel

_IMEI_ONLY = re.compile(r"^\d{14,17}$")
_IMEI_IN_LINK = re.compile(r"imei=(\d{14,17})", re.I)


class TrackingInput(BaseModel):
    imei: str | None
    share_link: str | None


def extract_imei_from_link(text: str) -> str | None:
    match = _IMEI_IN_LINK.search(text or "")
    return match.group(1) if match else None


def parse_tracking_input(raw: str) -> TrackingInput:
    trimmed = (raw or "").strip()
    if not trimmed:
        return TrackingInput(imei=None, share_link=None)
    if _IMEI_ONLY.match(trimmed):
        return TrackingInput(imei=trimmed, share_link=None)
    imei = extract_imei_from_link(trimmed)
    if imei:
        return TrackingInput(imei=imei, share_link=trimmed)
    return TrackingInput(imei=None, share_link=None)

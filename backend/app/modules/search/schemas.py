"""Bentuk hasil pencarian global."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SearchKind = Literal["job", "unit", "driver", "customer", "quotation"]


class SearchHit(BaseModel):
    kind: SearchKind
    id: str
    """Teks utama yang ditebalkan di daftar hasil."""
    label: str
    """Baris kedua — konteks supaya hasil sejenis mudah dibedakan."""
    sublabel: str | None = None
    """Tujuan navigasi saat hasil diklik; ditentukan server agar klien tidak
    perlu tahu pola rute tiap entitas."""
    href: str


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit] = Field(default_factory=list)

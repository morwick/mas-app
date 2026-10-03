from __future__ import annotations

from pydantic import BaseModel


class Sales(BaseModel):
    """Satu baris master sales (dropdown Sales di form proyek & edit job)."""

    id: str
    nama: str
    no_hp: str | None = None

"""Pencarian global untuk kotak cari di top bar."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.search.schemas import SearchResponse
from app.modules.search.service import SearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def global_search(
    q: str = Query("", description="Kata kunci; di bawah 2 karakter hasilnya kosong"),
    client: AsyncClient = Depends(user_client),
) -> SearchResponse:
    return await SearchService(client).search(q)

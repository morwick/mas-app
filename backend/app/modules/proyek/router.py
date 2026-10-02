"""Endpoint Proyek (menu Proyek → Tab Proyek).

- Lihat: superadmin, admin, finance (finance hanya melihat, sama seperti job).
- Buat / ubah: superadmin & admin — finance ditolak, sama seperti job.
- Tambah job ke proyek: PATCH /proyek/{id} (`jobs_baru`), atau POST /jobs dengan `proyek_id`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.core.errors import ForbiddenError
from app.core.paging import Page, PageParams, page_params
from app.modules.proyek.schemas import (
    ProyekCari,
    ProyekCreate,
    ProyekCreated,
    ProyekDetail,
    ProyekPerUnit,
    ProyekRingkas,
    ProyekUpdate,
    ProyekUpdated,
    StatusProyek,
    StatusTagih,
)
from app.modules.proyek.service import ProyekService

router = APIRouter(prefix="/proyek", tags=["proyek"])


def get_service(client: AsyncClient = Depends(user_client)) -> ProyekService:
    return ProyekService(client)


def _bukan_finance(auth: AuthContext = Depends(require_auth)) -> None:
    """BATASAN: finance hanya melihat proyek & job, tidak mengubahnya."""
    if auth.user.role == "finance":
        raise ForbiddenError("Role finance hanya bisa melihat proyek, tidak bisa mengubahnya.")


@router.get("/page", response_model=Page[ProyekRingkas])
async def daftar_proyek(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100, description="Nomor proyek, customer, PIC, nomor job")] = None,
    customer_id: str | None = None,
    tanpa_customer: Annotated[bool, Query(description="Hanya proyek tanpa customer (kosongan)")] = False,
    bulan: Annotated[int | None, Query(ge=1, le=12)] = None,
    tahun: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    status_tagih: StatusTagih | None = None,
    status_proyek: StatusProyek | None = None,
    svc: ProyekService = Depends(get_service),
) -> Page[ProyekRingkas]:
    return await svc.list_page(
        params=params,
        q=q,
        customer_id=customer_id,
        tanpa_customer=tanpa_customer,
        bulan=bulan,
        tahun=tahun,
        status_tagih=status_tagih,
        status_proyek=status_proyek,
    )


@router.get("/per-unit", response_model=Page[ProyekPerUnit])
async def proyek_per_unit(
    params: PageParams = Depends(page_params),
    q: Annotated[
        str | None, Query(max_length=100, description="Kode unit, no. polisi, no. job, no. proyek, customer")
    ] = None,
    bulan: Annotated[int | None, Query(ge=1, le=12)] = None,
    tahun: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    status_proyek: StatusProyek | None = None,
    svc: ProyekService = Depends(get_service),
) -> Page[ProyekPerUnit]:
    """Tab Proyek per unit: unit aktif + job yang memakainya (urut tanggal muat)."""
    return await svc.per_unit(params=params, q=q, bulan=bulan, tahun=tahun, status_proyek=status_proyek)


@router.get("/cari", response_model=ProyekCari | None)
async def cari_proyek(
    quotation_id: Annotated[str, Query(min_length=1)],
    unit_id: Annotated[str, Query(min_length=1)],
    svc: ProyekService = Depends(get_service),
) -> ProyekCari | None:
    """Proyek dari penawaran & unit yang sama (tombol "Buat / Gabung Proyek")."""
    return await svc.cari_untuk_penawaran(quotation_id, unit_id)


@router.get("/{proyek_id}", response_model=ProyekDetail)
async def detail_proyek(
    proyek_id: str,
    auth: AuthContext = Depends(require_auth),
    svc: ProyekService = Depends(get_service),
) -> ProyekDetail:
    # Info tagihan per job mengikuti aturan detail job (operator tidak menerimanya).
    return await svc.get(
        proyek_id,
        dengan_tagihan=auth.user.role in ("superadmin", "admin", "finance"),
        tagihan_lengkap=auth.user.role in ("superadmin", "finance"),
    )


@router.post("", response_model=ProyekCreated, status_code=201, dependencies=[Depends(_bukan_finance)])
async def buat_proyek(
    payload: ProyekCreate,
    auth: AuthContext = Depends(require_auth),
    svc: ProyekService = Depends(get_service),
) -> ProyekCreated:
    return await svc.create(payload, created_by=auth.user.id)


@router.patch("/{proyek_id}", response_model=ProyekUpdated, dependencies=[Depends(_bukan_finance)])
async def ubah_proyek(
    proyek_id: str,
    payload: ProyekUpdate,
    auth: AuthContext = Depends(require_auth),
    svc: ProyekService = Depends(get_service),
) -> ProyekUpdated:
    """Ubah customer/PIC proyek + tambah job baru (satu transaksi)."""
    return await svc.update(proyek_id, payload, created_by=auth.user.id)

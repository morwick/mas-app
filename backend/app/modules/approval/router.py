"""Endpoint Approval.

- `/approval/fitur`, `/approval/approver*`: master approver — superadmin saja.
- `/approval/menu`, `/approval/pengajuan*`: menu Approval untuk karyawan yang
  menjadi approver (role apa pun). Hak melihat & memutuskan dijaga fungsi
  database (approver aktif fitur itu / tercatat di pengajuan, giliran berjenjang).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, superadmin_client, user_client
from app.core.paging import Page, PageParams, page_params
from app.modules.approval.schemas import (
    Approver,
    ApproverInput,
    ApproverUbahInput,
    FiturApproval,
    FiturApprovalInfo,
    HasilKeputusan,
    KaryawanCalonApprover,
    MenuApproval,
    PengajuanApproval,
    PutuskanInput,
    RiwayatApproval,
    StatusPengajuan,
    UbahModeInput,
)
from app.modules.approval.service import ApprovalService
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/approval", tags=["approval"])


def _master(client: AsyncClient = Depends(superadmin_client)) -> ApprovalService:
    return ApprovalService(client)


def _staf(client: AsyncClient = Depends(user_client)) -> ApprovalService:
    return ApprovalService(client)


# ── Master approver (superadmin) ────────────────────────────────────────────


@router.get("/fitur", response_model=list[FiturApprovalInfo])
async def daftar_fitur(svc: ApprovalService = Depends(_master)) -> list[FiturApprovalInfo]:
    return await svc.daftar_fitur()


@router.patch("/fitur/{kode}", response_model=OkResponse)
async def ubah_mode(kode: FiturApproval, payload: UbahModeInput, svc: ApprovalService = Depends(_master)) -> OkResponse:
    await svc.ubah_mode(kode, payload.mode)
    return OkResponse()


@router.get("/approver", response_model=Page[Approver])
async def daftar_approver(
    params: PageParams = Depends(page_params),
    fitur: FiturApproval | None = None,
    q: Annotated[str | None, Query(max_length=100, description="Cari nama karyawan / fitur")] = None,
    svc: ApprovalService = Depends(_master),
) -> Page[Approver]:
    return await svc.daftar_approver(params=params, fitur=fitur, q=q)


@router.get("/calon-approver", response_model=list[KaryawanCalonApprover])
async def calon_approver(svc: ApprovalService = Depends(_master)) -> list[KaryawanCalonApprover]:
    return await svc.calon_approver()


@router.post("/approver", response_model=OkResponse, status_code=201)
async def tambah_approver(
    payload: ApproverInput,
    auth: AuthContext = Depends(require_auth),
    svc: ApprovalService = Depends(_master),
) -> OkResponse:
    await svc.tambah_approver(payload, created_by=auth.user.id)
    return OkResponse()


@router.patch("/approver/{approver_id}", response_model=OkResponse)
async def ubah_approver(
    approver_id: str, payload: ApproverUbahInput, svc: ApprovalService = Depends(_master)
) -> OkResponse:
    await svc.ubah_approver(approver_id, payload.urutan)
    return OkResponse()


@router.delete("/approver/{approver_id}", response_model=OkResponse)
async def hapus_approver(approver_id: str, svc: ApprovalService = Depends(_master)) -> OkResponse:
    await svc.hapus_approver(approver_id)
    return OkResponse()


# ── Menu Approval (approver, role apa pun) ──────────────────────────────────


@router.get("/menu", response_model=list[MenuApproval])
async def menu_saya(svc: ApprovalService = Depends(_staf)) -> list[MenuApproval]:
    return await svc.menu_saya()


@router.get("/pengajuan", response_model=Page[PengajuanApproval])
async def daftar_pengajuan(
    fitur: FiturApproval,
    params: PageParams = Depends(page_params),
    hanya_giliran: bool = False,
    status: StatusPengajuan | None = None,
    q: Annotated[str | None, Query(max_length=100, description="Cari judul / nama pengaju")] = None,
    tahun: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    bulan: Annotated[int | None, Query(ge=1, le=12)] = None,
    svc: ApprovalService = Depends(_staf),
) -> Page[PengajuanApproval]:
    return await svc.daftar_pengajuan(
        params=params, fitur=fitur, hanya_giliran=hanya_giliran, status=status, q=q, tahun=tahun, bulan=bulan
    )


@router.get("/pengajuan/{pengajuan_id}", response_model=PengajuanApproval)
async def detail_pengajuan(
    pengajuan_id: str, fitur: FiturApproval, svc: ApprovalService = Depends(_staf)
) -> PengajuanApproval:
    return await svc.detail_pengajuan(fitur, pengajuan_id)


@router.get("/uang-jalan/{uang_jalan_id}", response_model=RiwayatApproval)
async def riwayat_uang_jalan(uang_jalan_id: str, svc: ApprovalService = Depends(_staf)) -> RiwayatApproval:
    """Approver & catatan satu tambahan uang jalan (kartu uang jalan di detail job)."""
    return await svc.riwayat_uang_jalan(uang_jalan_id)


@router.post("/pengajuan/{pengajuan_id}/putuskan", response_model=HasilKeputusan)
async def putuskan(pengajuan_id: str, payload: PutuskanInput, svc: ApprovalService = Depends(_staf)) -> HasilKeputusan:
    return await svc.putuskan(pengajuan_id, payload)

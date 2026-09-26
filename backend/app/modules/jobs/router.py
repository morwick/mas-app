from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.core.errors import ForbiddenError
from app.core.paging import Page, PageParams, page_params
from app.domain.job_conflicts import ConflictCheckResult
from app.modules.auth.schemas import OkResponse
from app.modules.jobs.photos import JobPhotoService
from app.modules.jobs.schemas import (
    ActiveJobByUnit,
    CancelRequest,
    ConflictCheckRequest,
    GantiTrukEntry,
    GantiTrukRequest,
    Job,
    JobConflictResponse,
    JobCreate,
    JobCreated,
    JobListFilter,
    JobPhoto,
    JobStatusHistoryEntry,
    JobUpdate,
    PhotoSlotMasukan,
    PhotoStage,
    ReturnJobRequest,
    StatusResponse,
    UpdateStatusRequest,
    normalisasi_slot,
)
from app.modules.jobs.service import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])

CONFLICT_RESPONSE: dict[int | str, dict[str, Any]] = {
    409: {"model": JobConflictResponse, "description": "Bentrok jadwal"}
}


def _boleh_lihat_tagihan(auth: AuthContext) -> bool:
    """Info tagihan di job untuk admin (pengingat ke finance) & superadmin — operator tidak."""
    return auth.user.role in ("superadmin", "admin", "finance")


def _tagihan_lengkap(auth: AuthContext) -> bool:
    """Superadmin & finance: nomor tertaut, status tagihan, dan nominal."""
    return auth.user.role in ("superadmin", "finance")


def _bukan_finance(auth: AuthContext = Depends(require_auth)) -> None:
    """Finance hanya boleh melihat detail job (dari tagihan), tidak mengubahnya."""
    if auth.user.role == "finance":
        raise ForbiddenError("Role finance hanya bisa melihat job, tidak bisa mengubahnya.")


def get_service(client: AsyncClient = Depends(user_client)) -> JobService:
    return JobService(client)


def get_photo_service(client: AsyncClient = Depends(user_client)) -> JobPhotoService:
    return JobPhotoService(client)


@router.get("/page", response_model=Page[Job])
async def list_jobs_page(
    status: JobListFilter = Query("all"),
    customer_id: str | None = Query(None),
    q: str | None = Query(None, description="Cari nomor job, customer, alat, atau rute"),
    params: PageParams = Depends(page_params),
    auth: AuthContext = Depends(require_auth),
    svc: JobService = Depends(get_service),
) -> Page[Job]:
    return await svc.list_page(
        status=status,
        customer_id=customer_id,
        q=q,
        params=params,
        dengan_tagihan=_boleh_lihat_tagihan(auth),
        tagihan_lengkap=_tagihan_lengkap(auth),
    )


@router.get("", response_model=list[Job])
async def list_jobs(
    status: JobListFilter = Query("all"),
    customer_id: str | None = Query(None),
    svc: JobService = Depends(get_service),
) -> list[Job]:
    """Tanpa potongan — dipakai deteksi bentrok jadwal dan ekspor."""
    return await svc.list_all(status=status, customer_id=customer_id)


@router.get("/counts", response_model=dict[str, int])
async def job_tab_counts(
    customer_id: str | None = Query(None),
    q: str | None = Query(None),
    svc: JobService = Depends(get_service),
) -> dict[str, int]:
    """Jumlah per tab mengikuti filter yang sedang aktif — angka di tab harus
    cocok dengan isi daftarnya."""
    return await svc.tab_counts(customer_id=customer_id, q=q)


@router.get("/active-by-unit", response_model=list[ActiveJobByUnit])
async def active_by_unit(svc: JobService = Depends(get_service)) -> list[ActiveJobByUnit]:
    return await svc.active_by_unit()


@router.get("/schedule", response_model=list[Job])
async def schedule(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    svc: JobService = Depends(get_service),
) -> list[Job]:
    return await svc.list_in_range(start, end)


@router.post("/check-conflicts", response_model=ConflictCheckResult, dependencies=[Depends(_bukan_finance)])
async def check_conflicts(payload: ConflictCheckRequest, svc: JobService = Depends(get_service)) -> ConflictCheckResult:
    return await svc.check_conflicts(payload)


@router.get("/{job_id}", response_model=Job)
async def get_job(
    job_id: str,
    auth: AuthContext = Depends(require_auth),
    svc: JobService = Depends(get_service),
) -> Job:
    return await svc.get(job_id, dengan_tagihan=_boleh_lihat_tagihan(auth), tagihan_lengkap=_tagihan_lengkap(auth))


@router.get("/{job_id}/history", response_model=list[JobStatusHistoryEntry])
async def job_history(job_id: str, svc: JobService = Depends(get_service)) -> list[JobStatusHistoryEntry]:
    return await svc.status_history(job_id)


@router.get("/{job_id}/ganti-truk", response_model=list[GantiTrukEntry])
async def riwayat_ganti_truk(job_id: str, svc: JobService = Depends(get_service)) -> list[GantiTrukEntry]:
    return await svc.riwayat_ganti_truk(job_id)


@router.post("/{job_id}/ganti-truk", response_model=OkResponse, dependencies=[Depends(_bukan_finance)])
async def ganti_truk(job_id: str, payload: GantiTrukRequest, svc: JobService = Depends(get_service)) -> OkResponse:
    await svc.ganti_truk(job_id, payload)
    return OkResponse()


@router.post(
    "", response_model=JobCreated, status_code=201, responses=CONFLICT_RESPONSE, dependencies=[Depends(_bukan_finance)]
)
async def create_job(
    payload: JobCreate,
    auth: AuthContext = Depends(require_auth),
    svc: JobService = Depends(get_service),
) -> JobCreated:
    return await svc.create(payload, created_by=auth.user.id)


@router.patch(
    "/{job_id}", response_model=OkResponse, responses=CONFLICT_RESPONSE, dependencies=[Depends(_bukan_finance)]
)
async def update_job(job_id: str, payload: JobUpdate, svc: JobService = Depends(get_service)) -> OkResponse:
    await svc.update(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/status", response_model=OkResponse, dependencies=[Depends(_bukan_finance)])
async def update_status(
    job_id: str, payload: UpdateStatusRequest, svc: JobService = Depends(get_service)
) -> OkResponse:
    await svc.update_status(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/cancel", response_model=OkResponse, dependencies=[Depends(_bukan_finance)])
async def cancel_job(job_id: str, payload: CancelRequest, svc: JobService = Depends(get_service)) -> OkResponse:
    await svc.cancel(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/validate", response_model=StatusResponse, dependencies=[Depends(_bukan_finance)])
async def validate_job(job_id: str, svc: JobService = Depends(get_service)) -> StatusResponse:
    """Fase 7: Approve — job selesai, driver kembali Stand By."""
    return StatusResponse(status=await svc.validate(job_id))  # type: ignore[arg-type]


@router.post("/{job_id}/return", response_model=StatusResponse, dependencies=[Depends(_bukan_finance)])
async def return_job(job_id: str, payload: ReturnJobRequest, svc: JobService = Depends(get_service)) -> StatusResponse:
    """Fase 7: kembalikan ke driver dengan catatan perbaikan."""
    return StatusResponse(status=await svc.return_to_driver(job_id, payload))  # type: ignore[arg-type]


@router.post("/{job_id}/photos", response_model=JobPhoto, status_code=201, dependencies=[Depends(_bukan_finance)])
async def upload_photo(
    job_id: str,
    stage: PhotoStage = Form(..., alias="type"),
    slot: PhotoSlotMasukan | None = Form(None),
    photo: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
    svc: JobPhotoService = Depends(get_photo_service),
) -> JobPhoto:
    """Unggah foto oleh admin. `slot` opsional — tanpa slot foto jadi arsip tambahan."""
    data = await photo.read()
    return await svc.upload(
        job_id=job_id,
        stage=stage,
        slot=normalisasi_slot(slot) if slot else None,
        data=data,
        content_type=photo.content_type,
        uploaded_by=auth.user.id,
    )


@router.delete("/{job_id}/photos/{photo_id}", response_model=OkResponse, dependencies=[Depends(_bukan_finance)])
async def delete_photo(job_id: str, photo_id: str, svc: JobPhotoService = Depends(get_photo_service)) -> OkResponse:
    await svc.delete(photo_id)
    return OkResponse()

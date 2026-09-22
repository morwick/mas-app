from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.domain.job_conflicts import ConflictCheckResult
from app.modules.auth.schemas import OkResponse
from app.modules.jobs.photos import JobPhotoService
from app.modules.jobs.schemas import (
    ActiveJobByUnit,
    CancelRequest,
    ConflictCheckRequest,
    Job,
    JobConflictResponse,
    JobCreate,
    JobCreated,
    JobListFilter,
    JobPhoto,
    JobStatusHistoryEntry,
    JobUpdate,
    PhotoType,
    UpdateStatusRequest,
)
from app.modules.jobs.service import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])

CONFLICT_RESPONSE: dict[int | str, dict[str, Any]] = {
    409: {"model": JobConflictResponse, "description": "Bentrok jadwal"}
}


def get_service(client: AsyncClient = Depends(user_client)) -> JobService:
    return JobService(client)


def get_photo_service(client: AsyncClient = Depends(user_client)) -> JobPhotoService:
    return JobPhotoService(client)


@router.get("", response_model=list[Job])
async def list_jobs(
    status: JobListFilter = Query("all"),
    customer_id: str | None = Query(None),
    svc: JobService = Depends(get_service),
) -> list[Job]:
    return await svc.list_all(status=status, customer_id=customer_id)


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


@router.post("/check-conflicts", response_model=ConflictCheckResult)
async def check_conflicts(payload: ConflictCheckRequest, svc: JobService = Depends(get_service)) -> ConflictCheckResult:
    return await svc.check_conflicts(payload)


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str, svc: JobService = Depends(get_service)) -> Job:
    return await svc.get(job_id)


@router.get("/{job_id}/history", response_model=list[JobStatusHistoryEntry])
async def job_history(job_id: str, svc: JobService = Depends(get_service)) -> list[JobStatusHistoryEntry]:
    return await svc.status_history(job_id)


@router.post("", response_model=JobCreated, status_code=201, responses=CONFLICT_RESPONSE)
async def create_job(
    payload: JobCreate,
    auth: AuthContext = Depends(require_auth),
    svc: JobService = Depends(get_service),
) -> JobCreated:
    return await svc.create(payload, created_by=auth.user.id)


@router.patch("/{job_id}", response_model=OkResponse, responses=CONFLICT_RESPONSE)
async def update_job(job_id: str, payload: JobUpdate, svc: JobService = Depends(get_service)) -> OkResponse:
    await svc.update(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/status", response_model=OkResponse)
async def update_status(
    job_id: str, payload: UpdateStatusRequest, svc: JobService = Depends(get_service)
) -> OkResponse:
    await svc.update_status(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/cancel", response_model=OkResponse)
async def cancel_job(job_id: str, payload: CancelRequest, svc: JobService = Depends(get_service)) -> OkResponse:
    await svc.cancel(job_id, payload)
    return OkResponse()


@router.post("/{job_id}/photos", response_model=JobPhoto, status_code=201)
async def upload_photo(
    job_id: str,
    type: PhotoType = Form(...),
    photo: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
    svc: JobPhotoService = Depends(get_photo_service),
) -> JobPhoto:
    data = await photo.read()
    return await svc.upload(
        job_id=job_id,
        photo_type=type,
        data=data,
        content_type=photo.content_type,
        uploaded_by=auth.user.id,
    )


@router.delete("/{job_id}/photos/{photo_id}", response_model=OkResponse)
async def delete_photo(job_id: str, photo_id: str, svc: JobPhotoService = Depends(get_photo_service)) -> OkResponse:
    await svc.delete(photo_id)
    return OkResponse()

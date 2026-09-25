from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.incidents.schemas import (
    Incident,
    IncidentCreate,
    IncidentPhoto,
    IncidentUpdate,
    SetIncidentStatusRequest,
)
from app.modules.incidents.service import IncidentService

router = APIRouter(prefix="/incidents", tags=["incidents"])


def get_service(client: AsyncClient = Depends(user_client)) -> IncidentService:
    return IncidentService(client)


@router.get("/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str, svc: IncidentService = Depends(get_service)) -> Incident:
    return await svc.get(incident_id)


@router.post("", response_model=Incident, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    auth: AuthContext = Depends(require_auth),
    svc: IncidentService = Depends(get_service),
) -> Incident:
    return await svc.create(payload, created_by=auth.user.id)


@router.patch("/{incident_id}", response_model=OkResponse)
async def update_incident(
    incident_id: str, payload: IncidentUpdate, svc: IncidentService = Depends(get_service)
) -> OkResponse:
    await svc.update(incident_id, payload)
    return OkResponse()


@router.post("/{incident_id}/status", response_model=OkResponse)
async def set_status(
    incident_id: str,
    payload: SetIncidentStatusRequest,
    svc: IncidentService = Depends(get_service),
) -> OkResponse:
    await svc.set_status(incident_id, payload.status)
    return OkResponse()


@router.post("/{incident_id}/resolve", response_model=OkResponse)
async def resolve(incident_id: str, svc: IncidentService = Depends(get_service)) -> OkResponse:
    await svc.resolve(incident_id)
    return OkResponse()


@router.delete("/{incident_id}", response_model=OkResponse)
async def delete_incident(incident_id: str, svc: IncidentService = Depends(get_service)) -> OkResponse:
    await svc.delete(incident_id)
    return OkResponse()


@router.post("/{incident_id}/photos", response_model=IncidentPhoto, status_code=201)
async def upload_photo(
    incident_id: str,
    photo: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
    svc: IncidentService = Depends(get_service),
) -> IncidentPhoto:
    data = await photo.read()
    return await svc.upload_photo(
        incident_id=incident_id,
        data=data,
        content_type=photo.content_type,
        uploaded_by=auth.user.id,
    )


@router.delete("/{incident_id}/photos/{photo_id}", response_model=OkResponse)
async def delete_photo(incident_id: str, photo_id: str, svc: IncidentService = Depends(get_service)) -> OkResponse:
    await svc.delete_photo(photo_id)
    return OkResponse()

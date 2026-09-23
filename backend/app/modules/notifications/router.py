from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.notifications.service import AppNotification, NotificationService

log = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    """Id kejadian tanpa awalan `event-`."""

    ids: list[str] = Field(default_factory=list)


@router.get("", response_model=list[AppNotification])
async def list_notifications(
    auth: AuthContext = Depends(require_auth), client: AsyncClient = Depends(user_client)
) -> list[AppNotification]:
    # Lonceng tidak boleh menjatuhkan seluruh halaman kalau salah satu sumbernya
    # bermasalah — panel kosong lebih baik daripada layar error.
    try:
        return await NotificationService(client).build(user_id=auth.user.id)
    except Exception as exc:  # noqa: BLE001
        log.warning("gagal menyusun notifikasi: %s", exc)
        return []


@router.post("/read", response_model=OkResponse)
async def mark_read(
    payload: MarkReadRequest,
    auth: AuthContext = Depends(require_auth),
    client: AsyncClient = Depends(user_client),
) -> OkResponse:
    await NotificationService(client).mark_read(auth.user.id, payload.ids)
    return OkResponse()

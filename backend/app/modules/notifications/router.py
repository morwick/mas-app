from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.notifications.service import AppNotification, NotificationService

log = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[AppNotification])
async def list_notifications(client: AsyncClient = Depends(user_client)) -> list[AppNotification]:
    # Lonceng tidak boleh menjatuhkan seluruh halaman kalau salah satu sumbernya
    # bermasalah — panel kosong lebih baik daripada layar error.
    try:
        return await NotificationService(client).build()
    except Exception as exc:  # noqa: BLE001
        log.warning("gagal menyusun notifikasi: %s", exc)
        return []

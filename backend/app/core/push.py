"""Push notification ke aplikasi driver lewat Firebase Cloud Messaging.

Opsional: bila `FIREBASE_CREDENTIALS_FILE` tidak di-set, fungsi di sini hanya
mencatat log dan kembali — notifikasi in-app (tabel `notifications`) tetap
dibuat oleh trigger database, jadi driver masih melihatnya saat membuka app.

Token perangkat dibaca dengan service role (tabel `driver_devices` hanya bisa
dibaca admin/driver pemilik), lalu token yang ditolak FCM ditandai terhapus (soft delete).
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Any

from app.core.config import get_settings
from app.core.pg import rows
from app.core.soft_delete import DIHAPUS, STATUS
from app.core.supabase import get_client_factory

log = logging.getLogger(__name__)


@lru_cache
def _firebase_app() -> Any | None:
    path = get_settings().firebase_credentials_file
    if not path:
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials

        return firebase_admin.initialize_app(credentials.Certificate(path))
    except Exception as exc:  # noqa: BLE001
        log.warning("Firebase tidak aktif: %s", exc)
        return None


def _send_sync(tokens: list[str], title: str, body: str, data: dict[str, str]) -> list[str]:
    """Kirim ke banyak token; kembalikan token yang sudah tidak berlaku."""
    from firebase_admin import messaging

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=messaging.AndroidConfig(priority="high"),
    )
    response = messaging.send_each_for_multicast(message)
    stale: list[str] = []
    for token, result in zip(tokens, response.responses, strict=True):
        if result.success:
            continue
        code = getattr(getattr(result.exception, "code", None), "name", "") or str(result.exception)
        if "UNREGISTERED" in code.upper() or "NOT_FOUND" in code.upper() or "INVALID" in code.upper():
            stale.append(token)
        else:
            log.warning("FCM gagal untuk satu token: %s", result.exception)
    return stale


async def push_to_driver(driver_id: str, *, title: str, body: str, data: dict[str, str] | None = None) -> None:
    """Best-effort: tidak pernah melempar ke pemanggil."""
    try:
        if _firebase_app() is None:
            log.info("push (nonaktif) → driver %s: %s", driver_id, title)
            return
        factory = get_client_factory()
        async with factory.admin() as admin:
            res = await admin.table("driver_devices").select("fcm_token").eq("driver_id", driver_id).execute()
            tokens = [r["fcm_token"] for r in rows(res) if r.get("fcm_token")]
            if not tokens:
                return
            stale = await asyncio.to_thread(_send_sync, tokens, title, body, data or {})
            if stale:
                await admin.table("driver_devices").update({STATUS: DIHAPUS}).in_("fcm_token", stale).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("push ke driver %s gagal: %s", driver_id, exc)

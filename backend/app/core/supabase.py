"""Pabrik klien Supabase per konteks akses.

Ada empat identitas yang bisa menyentuh database, dan masing-masing dibedakan
lewat header yang dibaca policy RLS di Postgres:

- **user**   — admin/operator yang login; JWT Supabase dikirim sebagai Bearer.
- **share**  — pelanggan yang memegang link pelacakan; `x-share-token`.
- **driver** — portal driver; `x-driver-token` (bukan user Supabase).
- **admin**  — service role, menembus RLS. Hanya untuk cron & operasi sistem.

Semua klien dibuat per request lalu ditutup lagi supaya header identitas
tidak pernah bocor antar request.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager

from supabase import AsyncClient, AsyncClientOptions
from supabase_auth import AsyncMemoryStorage

from app.core.config import Settings, get_settings
from app.core.request_context import CLIENT_IP_HEADER, ip_klien
from app.core.soft_delete import DataClient

SHARE_TOKEN_HEADER = "x-share-token"
DRIVER_TOKEN_HEADER = "x-driver-token"


def _options(schema: str, headers: dict[str, str]) -> AsyncClientOptions:
    return AsyncClientOptions(
        schema=schema,
        headers=headers,
        storage=AsyncMemoryStorage(),
        auto_refresh_token=False,
        persist_session=False,
    )


async def _close(client: AsyncClient) -> None:
    # Sub-klien dibuat malas; hanya yang sempat dipakai yang punya sesi httpx.
    if client._postgrest is not None:  # noqa: SLF001 — API publik tidak menyediakan cek ini
        await client._postgrest.aclose()  # noqa: SLF001
    if client._storage is not None:  # noqa: SLF001
        await client._storage.session.aclose()  # noqa: SLF001


class SupabaseClientFactory:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @asynccontextmanager
    async def _open(self, key: str, headers: dict[str, str]) -> AsyncIterator[AsyncClient]:
        # IP pengguna ikut ke Postgres untuk log sistem (dibaca dari request.headers).
        ip = ip_klien.get()
        if ip:
            headers = {**headers, CLIENT_IP_HEADER: ip}
        # DataClient: select otomatis `status = 1`, delete jadi soft delete.
        client = DataClient(self._settings.supabase_url, key, _options(self._settings.supabase_db_schema, headers))
        try:
            yield client
        finally:
            await _close(client)

    def for_user(self, access_token: str) -> AbstractAsyncContextManager[AsyncClient]:
        """Klien yang tunduk RLS sebagai user yang login."""
        return self._open(
            self._settings.supabase_anon_key,
            {"Authorization": f"Bearer {access_token}"},
        )

    def anonymous(self, share_token: str | None = None) -> AbstractAsyncContextManager[AsyncClient]:
        """Klien anon — untuk login dan halaman pelacakan publik."""
        headers = {SHARE_TOKEN_HEADER: share_token} if share_token else {}
        return self._open(self._settings.supabase_anon_key, headers)

    def for_driver(self, session_token: str | None = None) -> AbstractAsyncContextManager[AsyncClient]:
        """Klien portal driver; identitas dibaca `current_driver_id()` di DB."""
        headers = {DRIVER_TOKEN_HEADER: session_token} if session_token else {}
        return self._open(self._settings.supabase_anon_key, headers)

    def admin(self) -> AbstractAsyncContextManager[AsyncClient]:
        """Service role — BYPASS RLS. Jangan dipakai untuk melayani request user biasa."""
        key = self._settings.supabase_service_role_key
        if not key:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY belum di-set")
        return self._open(key, {})


def get_client_factory() -> SupabaseClientFactory:
    return SupabaseClientFactory(get_settings())


def storage_public_url(bucket: str, path: str) -> str:
    base = get_settings().supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"

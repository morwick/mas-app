"""Isi lonceng notifikasi — semua diturunkan dari data yang benar-benar ada.

Tidak ada tabel notifikasi. Kondisinya dihitung ulang tiap panel dibuka karena
semuanya adalah keadaan sekarang, bukan kejadian: begitu job dikonfirmasi atau
unit diservis, barisnya memang harus hilang sendiri. Status "sudah dibaca"
disimpan per browser di frontend.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.paging import Page, PageParams, build_page
from app.core.pg import num, rows
from app.core.soft_delete import AKTIF
from app.core.timeutil import iso_utc, now_utc, parse_iso

log = logging.getLogger(__name__)

NotificationKind = Literal[
    "anomaly",
    "service_overdue",
    "service_due_soon",
    "job_unassigned",
    "gps_offline",
    "customer_new",
    "document_expiring",
    "invoice_overdue",
    # Kejadian (tabel notifications, FR-NOTIF-01)
    "job_diterima",
    "uang_jalan_diajukan",
    "job_menunggu_validasi",
]
Severity = Literal["info", "warning", "danger"]

MAX_PER_KIND = 5

_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


class AppNotification(BaseModel):
    id: str
    kind: NotificationKind
    severity: Severity
    title: str
    body: str
    href: str
    created_at: str
    # Kejadian yang tersimpan di database punya status dibaca per pengguna;
    # notifikasi keadaan (dihitung) tidak, dan frontend menyimpannya lokal.
    persistent: bool = False
    read: bool = False


def _rupiah(n: float) -> str:
    return "Rp " + f"{int(round(n)):,}".replace(",", ".")


def _days_until_date(ymd: str, now: datetime) -> float:
    target = datetime.fromisoformat(ymd[:10]).replace(tzinfo=now.tzinfo)
    return (target - now).total_seconds() / 86400


class NotificationService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def _event_notifications(self, user_id: str | None) -> list[AppNotification]:
        try:
            return await load_event_notifications(self._db, user_id=user_id)
        except Exception as exc:  # noqa: BLE001 — tabel belum ada / gagal → lonceng tetap tampil
            log.warning("gagal memuat notifikasi kejadian: %s", exc)
            return []

    async def mark_read(self, user_id: str, notification_ids: list[str]) -> None:
        """Tandai kejadian sebagai dibaca oleh admin ini (id tanpa awalan 'event-')."""
        if not notification_ids:
            return
        await (
            self._db.table("notification_reads")
            .upsert(
                [{"notification_id": nid, "user_id": user_id} for nid in notification_ids],
                on_conflict="notification_id,user_id",
            )
            .execute()
        )

    async def mark_all_read(self, user_id: str) -> None:
        """Tandai seluruh notifikasi admin sebagai dibaca oleh user ini."""
        res = await self._db.table("notifications").select("id").eq("recipient_type", "admin").execute()
        # mark_read menerima id mentah, tanpa awalan "event-".
        ids = [r["id"] for r in rows(res)]
        if ids:
            await self.mark_read(user_id, ids)

    async def page(self, params: PageParams, *, user_id: str | None = None) -> Page[AppNotification]:
        """Halaman Notifikasi — isinya sama persis dengan lonceng.

        Dipotong di memori, bukan di database: sebagian besar baris di sini
        adalah keadaan yang dihitung ulang (servis lewat jadwal, dokumen mau
        habis, job belum dikonfirmasi) dan tidak punya baris tabel untuk
        di-`range()`. Daftarnya dibatasi per jenis, jadi tetap kecil.
        """
        semua = await self.build(user_id=user_id)
        if params.is_all:
            return build_page(semua, len(semua), params)
        potong = semua[params.offset : params.offset + params.page_size]
        return build_page(potong, len(semua), params)

    async def build(self, now: datetime | None = None, *, user_id: str | None = None) -> list[AppNotification]:
        now = now or now_utc()
        now_iso = iso_utc(now)
        db = self._db

        (invoices_res,) = await asyncio.gather(
            db.table("invoices")
            .select("id, invoice_number, customer_nama, jatuh_tempo, total, dibayar")
            .eq("status_tagihan", "terkirim")
            .not_.is_("jatuh_tempo", "null")
            .lt("jatuh_tempo", now_iso[:10])
            .order("jatuh_tempo")
            .limit(MAX_PER_KIND)
            .execute(),
        )

        out: list[AppNotification] = []
        out.extend(await self._event_notifications(user_id))

        # Job belum dikonfirmasi / belum berangkat, dokumen jatuh tempo, servis,
        # insiden, dan penawaran (deal belum ada job / hampir kedaluwarsa) tidak
        # jadi notifikasi — sudah tampil di dashboard.

        # ── Piutang jatuh tempo ──────────────────────────────────────────────
        for inv in rows(invoices_res):
            sisa = num(inv.get("total")) - num(inv.get("dibayar"))
            if sisa <= 0:
                continue
            hari_lewat = int(-_days_until_date(inv["jatuh_tempo"], now))
            out.append(
                AppNotification(
                    id=f"invoice-jt-{inv['id']}",
                    kind="invoice_overdue",
                    severity="danger" if hari_lewat > 60 else "warning",
                    title="Tagihan lewat jatuh tempo",
                    body=f"{inv['invoice_number']} — {inv['customer_nama']}, {hari_lewat} hari, sisa {_rupiah(sisa)}",
                    href=f"/invoices/{inv['id']}",
                    created_at=inv["jatuh_tempo"],
                )
            )

        # Waktu notifikasi = saat peringatannya mulai berlaku, tidak pernah di
        # masa depan (dulu memakai tanggal kejadian → durasi "minus").
        batas = _sort_ts(now_iso)
        for n in out:
            if _sort_ts(n.created_at) > batas:
                n.created_at = now_iso
        # Terbaru dulu.
        out.sort(key=lambda n: -_sort_ts(n.created_at))
        return out


_EVENT_SEVERITY: dict[str, Severity] = {
    "job_diterima": "info",
    "uang_jalan_diajukan": "warning",
    "job_menunggu_validasi": "warning",
}


async def load_event_notifications(db: AsyncClient, *, user_id: str | None, limit: int = 30) -> list[AppNotification]:
    """Kejadian dari tabel `notifications` (dibuat trigger DB), dengan status dibaca per admin."""
    res = await (
        db.table("notifications")
        .select("id, kind, title, body, href, job_id, created_at, notification_reads(user_id)")
        .eq("recipient_type", "admin")
        .eq("notification_reads.status", AKTIF)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return _to_notifications(rows(res), user_id)


def _to_notifications(raw: list[dict[str, Any]], user_id: str | None) -> list[AppNotification]:
    out: list[AppNotification] = []
    for r in raw:
        kind = r["kind"] if r["kind"] in _EVENT_SEVERITY else "anomaly"
        reads = r.get("notification_reads") or []
        out.append(
            AppNotification(
                id=f"event-{r['id']}",
                kind=kind,  # type: ignore[arg-type]
                severity=_EVENT_SEVERITY.get(r["kind"], "info"),
                title=r["title"],
                body=r["body"],
                href=r.get("href") or "/dashboard",
                created_at=r["created_at"],
                persistent=True,
                read=any(x.get("user_id") == user_id for x in reads) if user_id else False,
            )
        )
    return out


def _sort_ts(value: str) -> float:
    try:
        return parse_iso(value if "T" in value else f"{value}T00:00:00").timestamp()
    except ValueError:
        return 0.0

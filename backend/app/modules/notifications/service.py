"""Isi lonceng notifikasi — semua diturunkan dari data yang benar-benar ada.

Tidak ada tabel notifikasi. Kondisinya dihitung ulang tiap panel dibuka karena
semuanya adalah keadaan sekarang, bukan kejadian: begitu job dikonfirmasi atau
unit diservis, barisnya memang harus hilang sendiri. Status "sudah dibaca"
disimpan per browser di frontend.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.pg import first, num, rows
from app.core.timeutil import iso_utc, now_utc, parse_iso
from app.domain.job_conflicts import ACTIVE_JOB_STATUSES
from app.domain.service_status import derive_service_status, format_km

NotificationKind = Literal[
    "anomaly",
    "service_overdue",
    "service_due_soon",
    "incident_open",
    "job_unassigned",
    "gps_offline",
    "customer_new",
    "document_expiring",
    "invoice_overdue",
]
Severity = Literal["info", "warning", "danger"]

# Ambang "sebentar lagi berangkat" untuk job yang belum dikonfirmasi driver.
KONFIRMASI_WINDOW_JAM = 24
# Penawaran yang masa berlakunya tinggal segini dianggap perlu ditindak.
PENAWARAN_KEDALUWARSA_HARI = 3
# Perpanjangan KIR/pajak butuh antre; seminggu tidak cukup.
DOKUMEN_PERINGATAN_HARI = 30
MAX_PER_KIND = 5

_SEVERITY_RANK = {"danger": 0, "warning": 1, "info": 2}
_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


class AppNotification(BaseModel):
    id: str
    kind: NotificationKind
    severity: Severity
    title: str
    body: str
    href: str
    created_at: str


def _fmt_jam(iso: str) -> str:
    d = parse_iso(iso).astimezone()
    return f"{d.day} {_BULAN[d.month - 1]} {d:%H:%M}"


def _fmt_tanggal(iso: str) -> str:
    d = parse_iso(iso) if "T" in iso else datetime.fromisoformat(iso[:10])
    return f"{d.day} {_BULAN[d.month - 1]} {d.year}"


def _rupiah(n: float) -> str:
    return "Rp " + f"{int(round(n)):,}".replace(",", ".")


def _hours_until(iso: str, now: datetime) -> float:
    return (parse_iso(iso) - now).total_seconds() / 3600


def _days_until_date(ymd: str, now: datetime) -> float:
    target = datetime.fromisoformat(ymd[:10]).replace(tzinfo=now.tzinfo)
    return (target - now).total_seconds() / 86400


class NotificationService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def build(self, now: datetime | None = None) -> list[AppNotification]:
        now = now or now_utc()
        now_iso = iso_utc(now)
        db = self._db

        (
            jobs_res,
            units_res,
            service_res,
            incidents_res,
            quotations_res,
            drivers_res,
            invoices_res,
        ) = await asyncio.gather(
            db.table("jobs")
            .select("id, job_number, etd, status, accepted_at, driver:drivers(nama), unit:units(kode_unit)")
            .in_("status", list(ACTIVE_JOB_STATUSES))
            .order("etd")
            .execute(),
            db.table("units")
            .select(
                "id, kode_unit, current_odometer_km, service_interval_km,"
                " stnk_berlaku_sampai, kir_berlaku_sampai, pajak_berlaku_sampai"
            )
            .eq("is_active", True)
            .execute(),
            db.table("service_records").select("unit_id, odometer_km").execute(),
            db.table("incident_logs")
            .select("id, tipe, tanggal, status, created_at, unit:units(kode_unit)")
            .in_("status", ["open", "in_progress"])
            .order("created_at", desc=True)
            .execute(),
            db.table("quotations")
            .select("id, quote_number, customer_nama, status, tanggal, berlaku_sampai, total")
            .in_("status", ["terkirim", "deal"])
            .execute(),
            db.table("drivers")
            .select("id, nama, sim_berlaku_sampai")
            .eq("is_active", True)
            .not_.is_("sim_berlaku_sampai", "null")
            .execute(),
            db.table("invoices")
            .select("id, invoice_number, customer_nama, jatuh_tempo, total, dibayar")
            .eq("status", "terkirim")
            .not_.is_("jatuh_tempo", "null")
            .lt("jatuh_tempo", now_iso[:10])
            .order("jatuh_tempo")
            .limit(MAX_PER_KIND)
            .execute(),
        )

        out: list[AppNotification] = []
        jobs = rows(jobs_res)

        # ── Job belum dikonfirmasi driver ────────────────────────────────────
        for j in [j for j in jobs if not j.get("accepted_at")][:MAX_PER_KIND]:
            jam_lagi = _hours_until(j["etd"], now)
            if jam_lagi > KONFIRMASI_WINDOW_JAM:
                continue
            lewat = jam_lagi < 0
            driver = (first(j.get("driver")) or {}).get("nama") or "driver"
            out.append(
                AppNotification(
                    id=f"job-belum-konfirmasi-{j['id']}",
                    kind="job_unassigned",
                    severity="danger" if lewat else "warning",
                    title="Belum dikonfirmasi, ETD sudah lewat" if lewat else "Job belum dikonfirmasi driver",
                    body=f"{j['job_number']} — {driver}, berangkat {_fmt_jam(j['etd'])}",
                    href=f"/jobs/{j['id']}",
                    created_at=j["etd"],
                )
            )

        # ── Job yang mestinya sudah jalan ────────────────────────────────────
        anomaly_count = 0
        for j in jobs:
            if j.get("status") != "menunggu_pickup" or parse_iso(j["etd"]) >= now:
                continue
            if any(n.id == f"job-belum-konfirmasi-{j['id']}" for n in out):
                continue
            out.append(
                AppNotification(
                    id=f"job-telat-{j['id']}",
                    kind="anomaly",
                    severity="danger",
                    title="Job belum berangkat",
                    body=f"{j['job_number']} masih menunggu pickup, ETD {_fmt_jam(j['etd'])}",
                    href=f"/jobs/{j['id']}",
                    created_at=j["etd"],
                )
            )
            anomaly_count += 1
            if anomaly_count >= MAX_PER_KIND:
                break

        # ── Servis ───────────────────────────────────────────────────────────
        last_service: dict[str, float] = {}
        for r in rows(service_res):
            km = num(r.get("odometer_km"), default=float("nan"))
            if km != km:
                continue
            if r["unit_id"] not in last_service or km > last_service[r["unit_id"]]:
                last_service[r["unit_id"]] = km

        units = rows(units_res)
        overdue = due_soon = 0
        for u in units:
            interval = num(u.get("service_interval_km"))
            if interval <= 0:
                continue
            derived = derive_service_status(
                current_odometer_km=num(u.get("current_odometer_km")),
                last_service_odometer_km=last_service.get(u["id"]),
                service_interval_km=interval,
            )
            if derived.status == "overdue" and overdue < MAX_PER_KIND:
                overdue += 1
                out.append(
                    AppNotification(
                        id=f"service-overdue-{u['id']}",
                        kind="service_overdue",
                        severity="danger",
                        title="Servis lewat jadwal",
                        body=f"{u['kode_unit']} sudah {format_km(abs(derived.km_to_next_service))} melewati interval",
                        href=f"/units/{u['id']}",
                        created_at=now_iso,
                    )
                )
            elif derived.status == "mendekati" and due_soon < MAX_PER_KIND:
                due_soon += 1
                out.append(
                    AppNotification(
                        id=f"service-soon-{u['id']}",
                        kind="service_due_soon",
                        severity="warning",
                        title="Servis mendekati",
                        body=f"{u['kode_unit']} sisa {format_km(derived.km_to_next_service)} menuju servis",
                        href=f"/units/{u['id']}",
                        created_at=now_iso,
                    )
                )

        # ── Dokumen kendaraan & SIM ──────────────────────────────────────────
        dokumen: list[dict[str, Any]] = []
        for u in units:
            for key, label in (
                ("stnk", "STNK"),
                ("kir", "KIR"),
                ("pajak", "Pajak kendaraan"),
            ):
                dokumen.append(
                    {
                        "id": f"{key}-{u['id']}",
                        "label": label,
                        "subjek": u["kode_unit"],
                        "href": f"/units/{u['id']}",
                        "tanggal": u.get(f"{key}_berlaku_sampai"),
                    }
                )
        for d in rows(drivers_res):
            dokumen.append(
                {
                    "id": f"sim-{d['id']}",
                    "label": "SIM",
                    "subjek": d["nama"],
                    "href": f"/drivers/{d['id']}/edit",
                    "tanggal": d.get("sim_berlaku_sampai"),
                }
            )
        for doc in dokumen:
            if not doc["tanggal"]:
                continue
            sisa = _days_until_date(doc["tanggal"], now)
            if sisa > DOKUMEN_PERINGATAN_HARI:
                continue
            habis = sisa < 0
            out.append(
                AppNotification(
                    id=f"doc-{doc['id']}",
                    kind="document_expiring",
                    severity="danger" if habis else "warning",
                    title=f"{doc['label']} sudah habis" if habis else f"{doc['label']} akan habis",
                    body=f"{doc['subjek']} — berlaku sampai {_fmt_tanggal(doc['tanggal'])}",
                    href=doc["href"],
                    created_at=doc["tanggal"],
                )
            )

        # ── Insiden belum selesai ────────────────────────────────────────────
        for i in rows(incidents_res)[:MAX_PER_KIND]:
            unit_kode = (first(i.get("unit")) or {}).get("kode_unit") or "Unit"
            open_ = i.get("status") == "open"
            out.append(
                AppNotification(
                    id=f"incident-{i['id']}",
                    kind="incident_open",
                    severity="danger" if open_ else "warning",
                    title="Insiden belum ditangani" if open_ else "Insiden dalam penanganan",
                    body=f"{unit_kode} — {i['tipe']}, {_fmt_tanggal(i['tanggal'])}",
                    href="/units",
                    created_at=i["created_at"],
                )
            )

        # ── Penawaran ────────────────────────────────────────────────────────
        quotations = rows(quotations_res)
        deal_ids = [q["id"] for q in quotations if q.get("status") == "deal"]
        deal_tanpa_job: set[str] = set()
        if deal_ids:
            job_rows = rows(await db.table("jobs").select("quotation_id").in_("quotation_id", deal_ids).execute())
            punya_job = {r["quotation_id"] for r in job_rows if r.get("quotation_id")}
            deal_tanpa_job = {qid for qid in deal_ids if qid not in punya_job}

        for q in quotations:
            if q.get("status") == "deal" and q["id"] in deal_tanpa_job:
                out.append(
                    AppNotification(
                        id=f"quotation-deal-{q['id']}",
                        kind="customer_new",
                        severity="info",
                        title="Penawaran deal belum dijadwalkan",
                        body=f"{q['quote_number']} — {q['customer_nama']}",
                        href=f"/quotations/{q['id']}",
                        created_at=q["tanggal"],
                    )
                )
                continue
            if q.get("status") == "terkirim" and q.get("berlaku_sampai"):
                sisa = _days_until_date(q["berlaku_sampai"], now)
                if sisa <= PENAWARAN_KEDALUWARSA_HARI:
                    out.append(
                        AppNotification(
                            id=f"quotation-expiring-{q['id']}",
                            kind="document_expiring",
                            severity="danger" if sisa < 0 else "warning",
                            title=(
                                "Penawaran sudah lewat masa berlaku" if sisa < 0 else "Penawaran mendekati masa berlaku"
                            ),
                            body=(
                                f"{q['quote_number']} — {q['customer_nama']}, "
                                f"berlaku sampai {_fmt_tanggal(q['berlaku_sampai'])}"
                            ),
                            href=f"/quotations/{q['id']}",
                            created_at=q["tanggal"],
                        )
                    )

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

        # Paling mendesak dulu, lalu yang paling baru.
        out.sort(key=lambda n: (_SEVERITY_RANK[n.severity], -_sort_ts(n.created_at)))
        return out


def _sort_ts(value: str) -> float:
    try:
        return parse_iso(value if "T" in value else f"{value}T00:00:00").timestamp()
    except ValueError:
        return 0.0

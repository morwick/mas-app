"""Pemetaan row PostgREST → model Job. Dipakai jobs, portal driver, dan pelacakan publik."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.core.pg import first, num_or_none
from app.core.supabase import storage_public_url
from app.modules.jobs.schemas import Job, JobPhoto

JOB_SELECT = """
  id, job_number, share_token, customer_id, pic_nama, pic_no_hp,
  alat_diangkut, asal, tujuan,
  asal_lat, asal_lng, tujuan_lat, tujuan_lng,
  route_polyline, route_distance_km, route_duration_min,
  unit_id, driver_id, etd, eta,
  status, catatan, cancelled_reason, accepted_at,
  pod_penerima_nama, pod_penerima_jabatan, pod_signature_path,
  pod_catatan, pod_at,
  created_at, completed_at,
  uang_jalan_pagu,
  quotation_id,
  quotation:quotations(quote_number),
  customer:customers(nama_perusahaan),
  photos:job_photos(id, type, file_path, uploaded_at)
"""

# Select untuk akses publik lewat share token. Sengaja tanpa uang_jalan_pagu:
# angka internal itu tidak boleh terkirim ke halaman pelanggan.
PUBLIC_JOB_SELECT = JOB_SELECT.replace("  uang_jalan_pagu,\n", "")

# Portal driver: tambah identitas unit, tanpa uang jalan dan penawaran.
DRIVER_JOB_SELECT = (
    PUBLIC_JOB_SELECT.replace("  quotation_id,\n  quotation:quotations(quote_number),\n", "")
    + ",\n  unit:units(kode_unit, no_polisi)"
)


def _photo_url(path: str) -> str:
    return storage_public_url(get_settings().job_photos_bucket, path)


def to_job(row: dict[str, Any]) -> Job:
    photos = [
        JobPhoto(
            id=p["id"],
            job_id=row["id"],
            type=p["type"],
            file_path=p["file_path"],
            file_url=_photo_url(p["file_path"]),
            uploaded_at=p["uploaded_at"],
        )
        for p in (row.get("photos") or [])
    ]
    quotation = first(row.get("quotation"))
    customer = first(row.get("customer"))
    unit = first(row.get("unit"))
    signature_path = row.get("pod_signature_path")

    return Job(
        id=row["id"],
        job_number=row["job_number"],
        share_token=row["share_token"],
        customer_id=row["customer_id"],
        customer_nama=(customer or {}).get("nama_perusahaan") or "—",
        pic_nama=row.get("pic_nama"),
        pic_no_hp=row.get("pic_no_hp"),
        alat_diangkut=row["alat_diangkut"],
        asal=row["asal"],
        tujuan=row["tujuan"],
        asal_lat=num_or_none(row.get("asal_lat")),
        asal_lng=num_or_none(row.get("asal_lng")),
        tujuan_lat=num_or_none(row.get("tujuan_lat")),
        tujuan_lng=num_or_none(row.get("tujuan_lng")),
        route_polyline=row.get("route_polyline"),
        route_distance_km=num_or_none(row.get("route_distance_km")),
        route_duration_min=num_or_none(row.get("route_duration_min")),
        uang_jalan_pagu=(num_or_none(row.get("uang_jalan_pagu")) or 0.0 if "uang_jalan_pagu" in row else None),
        unit_id=row["unit_id"],
        driver_id=row["driver_id"],
        etd=row["etd"],
        eta=row.get("eta"),
        status=row["status"],
        catatan=row.get("catatan"),
        cancelled_reason=row.get("cancelled_reason"),
        accepted_at=row.get("accepted_at"),
        pod_penerima_nama=row.get("pod_penerima_nama"),
        pod_penerima_jabatan=row.get("pod_penerima_jabatan"),
        pod_signature_path=signature_path,
        pod_signature_url=_photo_url(signature_path) if signature_path else None,
        pod_catatan=row.get("pod_catatan"),
        pod_at=row.get("pod_at"),
        created_at=row["created_at"],
        completed_at=row.get("completed_at"),
        quotation_id=row.get("quotation_id"),
        quotation_number=(quotation or {}).get("quote_number"),
        photos=photos,
        unit_kode=(unit or {}).get("kode_unit"),
        unit_no_polisi=(unit or {}).get("no_polisi"),
    )

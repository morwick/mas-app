"""Pemetaan row PostgREST → model Job. Dipakai jobs, portal driver, dan pelacakan publik."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.core.pg import first, num_or_none
from app.core.soft_delete import AKTIF, STATUS
from app.core.supabase import storage_public_url
from app.modules.jobs.schemas import Job, JobPhoto

_PHOTO_COLUMNS = "id, type, stage, slot, file_path, uploaded_at, sharpness_score, kualitas_rendah, taken_at, lat, lng"

_BASE_COLUMNS = """
  id, job_number, share_token, customer_id, pic_nama, pic_no_hp,
  alat_diangkut, asal, tujuan,
  asal_lat, asal_lng, tujuan_lat, tujuan_lng,
  route_polyline, route_distance_km, route_duration_min,
  unit_id, unit_trailer_id, trailer:unit_trailer(kode_trailer), driver_id, etd, eta,
  status_job, cancelled_reason, accepted_at, eta_is_estimated,
  pod_penerima_nama, pod_penerima_jabatan, pod_signature_path,
  pod_catatan, pod_at,
  created_at, completed_at,
  customer:customers(nama_perusahaan)"""

# Kolom internal: tidak boleh sampai ke pelanggan.
# `uang_jalan_requests` ikut supaya daftar job bisa menandai driver yang sedang
# menunggu pencairan tanpa satu permintaan tambahan per baris.
_INTERNAL_COLUMNS = """,
  catatan, uang_jalan_pagu,
  validated_at, validation_note,
  validator:profiles!jobs_validated_by_fkey(nama),
  quotation_id,
  quotation:quotations(quote_number),
  uang_jalan_requests(status_pengajuan, nominal, requested_at),
  uang_jalan(jenis, jumlah)"""

JOB_SELECT = f"{_BASE_COLUMNS}{_INTERNAL_COLUMNS},\n  photos:job_photos({_PHOTO_COLUMNS})"

# Akses publik lewat share token: tanpa catatan (BR-08), uang jalan, validasi, penawaran.
PUBLIC_JOB_SELECT = f"{_BASE_COLUMNS},\n  photos:job_photos({_PHOTO_COLUMNS})"

# Portal driver: seperti publik + catatan validasi (alasan job dikembalikan) + identitas unit.
DRIVER_JOB_SELECT = (
    f"{_BASE_COLUMNS},\n  validated_at, validation_note,\n"
    f"  photos:job_photos({_PHOTO_COLUMNS}),\n  unit:units(kode_unit, no_polisi)"
)

# Daftar anak (embed to-many) per select. Soft delete otomatis hanya menyaring
# tabel jobs-nya sendiri; baris anak yang sudah dihapus (status 2) harus
# disaring terpisah lewat `active_children`.
_CHILD_LISTS: dict[str, tuple[str, ...]] = {
    JOB_SELECT: ("photos", "uang_jalan_requests", "uang_jalan"),
    PUBLIC_JOB_SELECT: ("photos",),
    DRIVER_JOB_SELECT: ("photos",),
}


def active_children(query: Any, select: str) -> Any:
    """Tambahkan filter `<embed>.status = 1` untuk tiap daftar anak di `select`.

    Select lain (mis. `"id"` untuk hitungan) dibiarkan apa adanya — PostgREST
    menolak filter embed yang tidak ikut di-select.
    """
    for embed in _CHILD_LISTS.get(select, ()):
        query = query.eq(f"{embed}.{STATUS}", AKTIF)
    return query


def _photo_url(path: str) -> str:
    return storage_public_url(get_settings().job_photos_bucket, path)


def to_job(row: dict[str, Any]) -> Job:
    photos = [
        JobPhoto(
            id=p["id"],
            job_id=row["id"],
            type=p["type"],
            stage=p.get("stage") or p["type"],
            slot=p.get("slot"),
            file_path=p["file_path"],
            file_url=_photo_url(p["file_path"]),
            uploaded_at=p["uploaded_at"],
            sharpness_score=num_or_none(p.get("sharpness_score")),
            kualitas_rendah=bool(p.get("kualitas_rendah", False)),
            taken_at=p.get("taken_at"),
            lat=num_or_none(p.get("lat")),
            lng=num_or_none(p.get("lng")),
        )
        for p in (row.get("photos") or [])
    ]
    # Database hanya mengizinkan satu pengajuan menunggu per job, jadi yang
    # pertama ketemu sudah pasti satu-satunya.
    pending_uj = next(
        (r for r in (row.get("uang_jalan_requests") or []) if r.get("status_pengajuan") == "diajukan"),
        None,
    )
    # Uang yang sudah benar-benar ditransfer ke driver. Dipakai daftar & detail
    # job untuk menutup tombol Batalkan begitu ada isinya.
    uj_cair = sum(
        num_or_none(r.get("jumlah")) or 0.0 for r in (row.get("uang_jalan") or []) if r.get("jenis") == "pencairan"
    )
    quotation = first(row.get("quotation"))
    customer = first(row.get("customer"))
    unit = first(row.get("unit"))
    trailer = first(row.get("trailer"))
    validator = first(row.get("validator"))
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
        uang_jalan_pagu=(num_or_none(row.get("uang_jalan_pagu")) or 0.0) if "uang_jalan_pagu" in row else None,
        unit_id=row["unit_id"],
        unit_trailer_id=row.get("unit_trailer_id"),
        unit_trailer_kode=(trailer or {}).get("kode_trailer"),
        driver_id=row["driver_id"],
        etd=row["etd"],
        eta=row.get("eta"),
        status=row["status_job"],
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
        validated_at=row.get("validated_at"),
        validated_by_nama=(validator or {}).get("nama"),
        validation_note=row.get("validation_note"),
        eta_is_estimated=bool(row.get("eta_is_estimated", False)),
        quotation_id=row.get("quotation_id"),
        quotation_number=(quotation or {}).get("quote_number"),
        uang_jalan_cair=uj_cair,
        uang_jalan_pending=pending_uj is not None,
        uang_jalan_pending_nominal=num_or_none((pending_uj or {}).get("nominal")),
        uang_jalan_pending_at=(pending_uj or {}).get("requested_at"),
        photos=photos,
        unit_kode=(unit or {}).get("kode_unit"),
        unit_no_polisi=(unit or {}).get("no_polisi"),
    )

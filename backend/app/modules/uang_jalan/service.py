"""Uang jalan: pagu, pengajuan driver, pencairan berbukti, posisi per job.

Aturan (PRD v2 §7.2):
- Pagu wajib diisi saat job dibuat; penambahan pagu tetap lewat transaksi.
- Driver mengajukan nominal ≤ sisa pagu (ditegakkan RPC `driver_request_uang_jalan`).
- Pencairan admin wajib menyertakan foto bukti transfer (trigger DB menolak
  tanpa bukti). Bukti disimpan di bucket privat dan dibaca lewat signed URL.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.core.push import push_to_driver
from app.core.storage import (
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.domain.uang_jalan import hitung_ringkasan
from app.modules.uang_jalan.schemas import (
    JobUangJalan,
    SumberDana,
    UangJalan,
    UangJalanInput,
    UangJalanJobRow,
    UangJalanPosisi,
    UangJalanRequest,
)

log = logging.getLogger(__name__)

SIGNED_URL_TTL_S = 60 * 60

UANG_JALAN_SELECT = """
  id, job_id, jenis, tanggal, jumlah, sumber_dana_id, keperluan, catatan, created_at,
  bukti_transfer_path, request_id,
  sumber:sumber_dana(nama),
  creator:profiles(nama)
"""

REQUEST_SELECT = """
  id, job_id, driver_id, nominal, catatan, status, alasan_tolak, uang_jalan_id,
  requested_at, decided_at,
  job:jobs(job_number),
  driver:drivers(nama)
"""


def _to_uang_jalan(r: dict[str, Any], bukti_url: str | None = None) -> UangJalan:
    return UangJalan(
        id=r["id"],
        job_id=r["job_id"],
        jenis=r["jenis"],
        tanggal=r["tanggal"],
        jumlah=num(r.get("jumlah")),
        sumber_dana_id=r.get("sumber_dana_id"),
        sumber_dana_nama=(first(r.get("sumber")) or {}).get("nama"),
        keperluan=r.get("keperluan"),
        catatan=r.get("catatan"),
        created_by_nama=(first(r.get("creator")) or {}).get("nama"),
        created_at=r["created_at"],
        bukti_transfer_path=r.get("bukti_transfer_path"),
        bukti_transfer_url=bukti_url,
        request_id=r.get("request_id"),
    )


def to_request(r: dict[str, Any]) -> UangJalanRequest:
    return UangJalanRequest(
        id=r["id"],
        job_id=r["job_id"],
        job_number=(first(r.get("job")) or {}).get("job_number"),
        driver_id=r["driver_id"],
        driver_nama=(first(r.get("driver")) or {}).get("nama"),
        nominal=num(r.get("nominal")),
        catatan=r.get("catatan"),
        status=r["status"],
        alasan_tolak=r.get("alasan_tolak"),
        uang_jalan_id=r.get("uang_jalan_id"),
        requested_at=r["requested_at"],
        decided_at=r.get("decided_at"),
    )


def to_posisi(row: dict[str, Any] | None) -> UangJalanPosisi | None:
    if not row:
        return None
    return UangJalanPosisi(
        pagu=num(row.get("pagu")),
        cair=num(row.get("cair")),
        sisa=num(row.get("sisa")),
        ada_bukti=bool(row.get("ada_bukti")),
        pending_request=bool(row.get("pending_request")),
    )


def _rupiah(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


def _validate(payload: UangJalanInput) -> None:
    """Pencairan wajib menyebut kasnya; penambahan pagu tidak boleh punya sumber."""
    if payload.jumlah <= 0:
        raise ValidationError("Jumlah harus lebih dari nol")
    if payload.jenis == "pencairan" and not payload.sumber_dana_id:
        raise ValidationError("Uang yang dikasih harus menyebut dari kas mana")
    if payload.jenis == "penambahan_pagu" and payload.sumber_dana_id:
        raise ValidationError("Penambahan pagu tidak memakai sumber dana — itu kesepakatan, bukan uang keluar")


def _clean(payload: UangJalanInput) -> dict[str, Any]:
    return {
        "job_id": payload.job_id,
        "jenis": payload.jenis,
        "tanggal": payload.tanggal,
        "jumlah": round(payload.jumlah),
        "sumber_dana_id": payload.sumber_dana_id if payload.jenis == "pencairan" else None,
        "keperluan": clean_text(payload.keperluan),
        "catatan": clean_text(payload.catatan),
    }


class UangJalanService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().bukti_transfer_bucket

    # ── Baca ────────────────────────────────────────────────────────────────

    async def list_sumber_dana(self, *, only_active: bool = True) -> list[SumberDana]:
        q = (
            self._db.table("sumber_dana")
            .select("id, nama, bank, pemegang, kolom_excel, urutan, is_active")
            .order("urutan")
            .order("nama")
        )
        if only_active:
            q = q.eq("is_active", True)
        return [SumberDana(**r) for r in rows(await q.execute())]

    async def _signed_url(self, path: str | None) -> str | None:
        if not path:
            return None
        try:
            res = await self._db.storage.from_(self._bucket).create_signed_url(path, SIGNED_URL_TTL_S)
            return res.get("signedURL") or res.get("signedUrl")
        except Exception as exc:  # noqa: BLE001 — bukti yang tidak terbaca jangan gagalkan halaman
            log.warning("signed url bukti gagal: %s", exc)
            return None

    async def list_by_job(self, job_id: str, *, with_bukti_url: bool = True) -> list[UangJalan]:
        res = await (
            self._db.table("uang_jalan")
            .select(UANG_JALAN_SELECT)
            .eq("job_id", job_id)
            .order("tanggal")
            .order("created_at")
            .execute()
        )
        out = []
        for r in rows(res):
            url = await self._signed_url(r.get("bukti_transfer_path")) if with_bukti_url else None
            out.append(_to_uang_jalan(r, url))
        return out

    async def list_requests_by_job(self, job_id: str) -> list[UangJalanRequest]:
        res = await (
            self._db.table("uang_jalan_requests")
            .select(REQUEST_SELECT)
            .eq("job_id", job_id)
            .order("requested_at", desc=True)
            .execute()
        )
        return [to_request(r) for r in rows(res)]

    async def list_pending_requests(self) -> list[UangJalanRequest]:
        res = await (
            self._db.table("uang_jalan_requests")
            .select(REQUEST_SELECT)
            .eq("status", "diajukan")
            .order("requested_at")
            .execute()
        )
        return [to_request(r) for r in rows(res)]

    async def posisi(self, job_id: str) -> UangJalanPosisi | None:
        res = await self._db.rpc("job_uang_jalan_posisi", {"p_job_id": job_id}).execute()
        return to_posisi(first(res.data))

    async def job_summary(self, job_id: str, *, with_bukti_url: bool = True) -> JobUangJalan:
        job = single(await self._db.table("jobs").select("uang_jalan_pagu").eq("id", job_id).maybe_single().execute())
        transaksi = await self.list_by_job(job_id, with_bukti_url=with_bukti_url)
        return JobUangJalan(
            transaksi=transaksi,
            ringkasan=hitung_ringkasan(num((job or {}).get("uang_jalan_pagu")), transaksi),  # type: ignore[arg-type]
            pengajuan=await self.list_requests_by_job(job_id),
            posisi=await self.posisi(job_id),
        )

    async def list_jobs(
        self, *, hanya_belum_lunas: bool = False, hanya_berjalan: bool = False
    ) -> list[UangJalanJobRow]:
        """Daftar job beserta posisi uang jalannya. Transaksi diambil sekaligus lewat
        relasi lalu dijumlahkan di sini — cukup untuk ratusan job per bulan."""
        res = await (
            self._db.table("jobs")
            .select(
                "id, job_number, status, asal, tujuan, etd, uang_jalan_pagu,"
                " unit:units(kode_unit), driver:drivers(nama),"
                " customer:customers(nama_perusahaan),"
                " uang_jalan(id, jenis, jumlah, tanggal),"
                " uang_jalan_requests(id, status)"
            )
            .neq("status", "cancelled")
            .order("etd", desc=True)
            .execute()
        )
        out: list[UangJalanJobRow] = []
        for r in rows(res):
            transaksi = [
                UangJalan(
                    id=t["id"],
                    job_id=r["id"],
                    jenis=t["jenis"],
                    tanggal=t["tanggal"],
                    jumlah=num(t.get("jumlah")),
                    created_at=t["tanggal"],
                )
                for t in (r.get("uang_jalan") or [])
            ]
            ringkasan = hitung_ringkasan(num(r.get("uang_jalan_pagu")), transaksi)  # type: ignore[arg-type]
            pencairan = sorted(t.tanggal for t in transaksi if t.jenis == "pencairan")
            out.append(
                UangJalanJobRow(
                    job_id=r["id"],
                    job_number=r["job_number"],
                    status=r["status"],
                    asal=r["asal"],
                    tujuan=r["tujuan"],
                    etd=r["etd"],
                    unit_kode=(first(r.get("unit")) or {}).get("kode_unit"),
                    driver_nama=(first(r.get("driver")) or {}).get("nama"),
                    customer_nama=(first(r.get("customer")) or {}).get("nama_perusahaan"),
                    ringkasan=ringkasan,
                    pencairan_terakhir=pencairan[-1] if pencairan else None,
                    pengajuan_menunggu=sum(
                        1 for q in (r.get("uang_jalan_requests") or []) if q.get("status") == "diajukan"
                    ),
                )
            )
        if hanya_belum_lunas:
            out = [r for r in out if r.ringkasan.sisa > 0]
        if hanya_berjalan:
            out = [r for r in out if r.status != "selesai"]
        return out

    # ── Tulis (admin) ───────────────────────────────────────────────────────

    async def create(
        self,
        payload: UangJalanInput,
        *,
        created_by: str | None,
        bukti: tuple[bytes, str | None] | None = None,
        request_id: str | None = None,
    ) -> UangJalan:
        """Catat transaksi. Untuk pencairan, `bukti` (bytes, content-type) wajib."""
        _validate(payload)
        bukti_path: str | None = None
        if payload.jenis == "pencairan":
            if bukti is None:
                raise ValidationError("Pencairan uang jalan wajib menyertakan foto bukti transfer")
            data, content_type = bukti
            ext = validate_photo(content_type, len(data))
            bukti_path = f"{payload.job_id}/{unique_object_name(ext)}"
            await upload_object(self._db, self._bucket, bukti_path, data, content_type or "image/jpeg")

        try:
            res = await (
                self._db.table("uang_jalan")
                .insert(
                    {
                        **_clean(payload),
                        "created_by": created_by,
                        "bukti_transfer_path": bukti_path,
                        "request_id": request_id or None,
                    }
                )
                .execute()
            )
        except Exception:
            if bukti_path:
                await remove_object_quietly(self._db, self._bucket, bukti_path)
            raise

        created_id = rows(res)[0]["id"]
        full = await self._db.table("uang_jalan").select(UANG_JALAN_SELECT).eq("id", created_id).execute()
        row = rows(full)[0]

        if bukti_path:
            job = single(
                await self._db.table("jobs")
                .select("driver_id, job_number")
                .eq("id", payload.job_id)
                .maybe_single()
                .execute()
            )
            if job:
                await push_to_driver(
                    job["driver_id"],
                    title="Uang jalan sudah ditransfer",
                    body=f"{job['job_number']} — Rp {_rupiah(payload.jumlah)}. Anda bisa melanjutkan perjalanan.",
                    data={"job_id": payload.job_id, "kind": "bukti_transfer"},
                )
        return _to_uang_jalan(row, await self._signed_url(bukti_path))

    async def update(self, uang_jalan_id: str, payload: UangJalanInput) -> None:
        _validate(payload)
        await self._db.table("uang_jalan").update(_clean(payload)).eq("id", uang_jalan_id).execute()

    async def delete(self, uang_jalan_id: str) -> None:
        row = single(
            await self._db.table("uang_jalan")
            .select("bukti_transfer_path")
            .eq("id", uang_jalan_id)
            .maybe_single()
            .execute()
        )
        await self._db.table("uang_jalan").delete().eq("id", uang_jalan_id).execute()
        if row and row.get("bukti_transfer_path"):
            await remove_object_quietly(self._db, self._bucket, row["bukti_transfer_path"])

    async def set_pagu(self, job_id: str, pagu: float) -> None:
        """Pagu awal disimpan di job; kenaikan sesudahnya dicatat sebagai
        transaksi 'penambahan_pagu' supaya ada jejaknya."""
        await self._db.table("jobs").update({"uang_jalan_pagu": round(pagu)}).eq("id", job_id).execute()

    async def reject_request(self, request_id: str, *, alasan: str | None, decided_by: str) -> None:
        req = single(
            await self._db.table("uang_jalan_requests")
            .select("id, status, driver_id, job_id")
            .eq("id", request_id)
            .maybe_single()
            .execute()
        )
        if req is None:
            raise NotFoundError("Pengajuan tidak ditemukan")
        if req["status"] != "diajukan":
            raise ValidationError("Pengajuan sudah diputuskan")
        await (
            self._db.table("uang_jalan_requests")
            .update({"status": "ditolak", "alasan_tolak": clean_text(alasan), "decided_by": decided_by})
            .eq("id", request_id)
            .execute()
        )
        await push_to_driver(
            req["driver_id"],
            title="Pengajuan uang jalan ditolak",
            body=clean_text(alasan) or "Hubungi kantor untuk keterangan.",
            data={"job_id": req["job_id"], "kind": "uang_jalan_ditolak"},
        )

    # ── Driver ──────────────────────────────────────────────────────────────

    async def driver_request(self, job_id: str, *, nominal: int, catatan: str | None) -> UangJalanRequest:
        res = await self._db.rpc(
            "driver_request_uang_jalan",
            {"p_job_id": job_id, "p_nominal": nominal, "p_catatan": clean_text(catatan)},
        ).execute()
        row = first(res.data)
        if not row:
            raise ValidationError("Pengajuan gagal disimpan")
        return to_request(row)

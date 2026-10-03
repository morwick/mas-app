"""Proyek — induk dari job (migration 20261001000012).

Proyek menyimpan customer (boleh kosong: unit jalan kosongan), PIC lapangan,
dan No HP PIC; job hanya menyimpan detail pengiriman, unit & driver, dan
catatan internal.

Aturan yang dijaga di sini (database juga menjaganya, lihat migration):
  * proyek baru wajib langsung berisi minimal 1 job — proyek & semua jobnya
    disimpan dalam SATU transaksi; gagal salah satu = tidak ada yang tersimpan;
  * job baru di form edit proyek disimpan satu transaksi dengan perubahan
    customer/PIC proyeknya;
  * nomor proyek dibuat database (reset tiap bulan).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from supabase import AsyncClient

from app.core.errors import NotFoundError, ValidationError
from app.core.paging import ALL_PAGE_SIZE, Page, PageParams
from app.core.pg import first, num, rows, single
from app.core.soft_delete import AKTIF
from app.core.transaksi import Transaksi
from app.domain.uang_jalan import TransaksiRingkas, hitung_ringkasan
from app.modules.jobs.schemas import Job, JobCreate, JobCreated
from app.modules.jobs.service import JobService
from app.modules.proyek.schemas import (
    JobUnitBaris,
    ProyekBiayaJob,
    ProyekCari,
    ProyekCreate,
    ProyekCreated,
    ProyekDetail,
    ProyekPerUnit,
    ProyekRingkas,
    ProyekTagihan,
    ProyekUpdate,
    ProyekUpdated,
    StatusProyek,
    StatusTagih,
)
from app.modules.sales.service import SalesService

_DETAIL_SELECT = (
    "id, nomor_proyek, customer_id, pic_nama, pic_no_hp, created_at,"
    " customer:customers(nama_perusahaan), pembuat:profiles!proyek_created_by_fkey(nama)"
)


def _to_ringkas(r: dict[str, Any]) -> ProyekRingkas:
    return ProyekRingkas(
        id=str(r["id"]),
        nomor_proyek=r["nomor_proyek"],
        customer_id=str(r["customer_id"]) if r.get("customer_id") else None,
        customer_nama=r.get("customer_nama"),
        pic_nama=r.get("pic_nama"),
        pic_no_hp=r.get("pic_no_hp"),
        created_by_nama=r.get("created_by_nama"),
        created_at=str(r["created_at"]),
        jumlah_job=int(r.get("jumlah_job") or 0),
        jumlah_job_selesai=int(r.get("jumlah_job_selesai") or 0),
        jumlah_job_batal=int(r.get("jumlah_job_batal") or 0),
        invoice_id=str(r["invoice_id"]) if r.get("invoice_id") else None,
        invoice_number=r.get("invoice_number"),
        unit_kode=r.get("unit_kode"),
        quote_number=r.get("quote_number"),
    )


def _cek_satu_unit_satu_penawaran(jobs: list[JobCreate]) -> None:
    """BATASAN: job-job dalam satu proyek baru harus satu unit & satu penawaran
    (database juga menjaga — trigger jobs_cek_gabung_proyek)."""
    if len({j.unit_id for j in jobs}) > 1:
        raise ValidationError("Semua job dalam satu proyek harus memakai unit yang sama — unit lain buat proyek baru.")
    if len({j.quotation_id or None for j in jobs}) > 1:
        raise ValidationError("Semua job dalam satu proyek harus dari penawaran yang sama.")


def _baris_job(hasil: list[list[dict[str, Any]]], jumlah: int) -> list[dict[str, Any]]:
    """Baris job hasil transaksi — langkah job selalu ditambahkan paling akhir
    (setelah proyek & langkah sales)."""
    return [h[0] for h in hasil[len(hasil) - jumlah :]]


def _job_created(row: dict[str, Any]) -> JobCreated:
    return JobCreated(id=row["id"], job_number=row["job_number"], share_token=row["share_token"])


class ProyekService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._jobs = JobService(client)

    # ── Baca ────────────────────────────────────────────────────────────────

    async def list_page(
        self,
        *,
        params: PageParams,
        q: str | None = None,
        customer_id: str | None = None,
        tanpa_customer: bool = False,
        bulan: int | None = None,
        tahun: int | None = None,
        status_tagih: StatusTagih | None = None,
        status_proyek: StatusProyek | None = None,
    ) -> Page[ProyekRingkas]:
        """Paging, pencarian (nomor proyek, customer, PIC, nomor job), dan
        filter dijalankan di database (fungsi `daftar_proyek`, LIMIT/OFFSET)."""
        # "Semua" tetap dibatasi pagar yang sama dengan daftar lain (app/core/paging.py).
        limit = params.last_index - params.offset + 1
        res = await self._db.rpc(
            "daftar_proyek",
            {
                "p_q": (q or "").strip() or None,
                "p_customer_id": customer_id or None,
                "p_tanpa_customer": tanpa_customer,
                "p_bulan": bulan,
                "p_tahun": tahun,
                "p_status_tagih": status_tagih,
                "p_status_proyek": status_proyek,
                "p_limit": limit,
                "p_offset": params.offset,
            },
        ).execute()
        data = rows(res)
        total = int(data[0]["total"]) if data else 0
        return Page[ProyekRingkas](
            items=[_to_ringkas(r) for r in data], total=total, page=params.page, page_size=params.page_size
        )

    async def per_unit(
        self,
        *,
        params: PageParams,
        q: str | None = None,
        bulan: int | None = None,
        tahun: int | None = None,
        status_proyek: StatusProyek | None = None,
    ) -> Page[ProyekPerUnit]:
        """Tab Proyek per unit: paging per unit di database (LIMIT/OFFSET), job
        tiap unit urut tanggal muat (daftar_proyek_per_unit)."""
        limit = params.last_index - params.offset + 1
        res = await self._db.rpc(
            "daftar_proyek_per_unit",
            {
                "p_q": (q or "").strip() or None,
                "p_bulan": bulan,
                "p_tahun": tahun,
                "p_status_proyek": status_proyek,
                "p_limit": limit,
                "p_offset": params.offset,
            },
        ).execute()
        data = rows(res)
        total = int(data[0]["total"]) if data else 0
        items = [
            ProyekPerUnit(
                unit_id=str(r["unit_id"]),
                kode_unit=r["kode_unit"],
                no_polisi=r.get("no_polisi"),
                jenis_unit_nama=r.get("jenis_unit_nama"),
                jobs=[JobUnitBaris(**j) for j in (r.get("jobs") or [])],
            )
            for r in data
        ]
        return Page[ProyekPerUnit](items=items, total=total, page=params.page, page_size=params.page_size)

    async def get(self, proyek_id: str, *, dengan_tagihan: bool, tagihan_lengkap: bool) -> ProyekDetail:
        row = single(await self._db.table("proyek").select(_DETAIL_SELECT).eq("id", proyek_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Proyek tidak ditemukan")
        jobs = (
            await self._jobs.list_page(
                params=PageParams(page=1, page_size=ALL_PAGE_SIZE),
                proyek_id=proyek_id,
                dengan_tagihan=dengan_tagihan,
                tagihan_lengkap=tagihan_lengkap,
            )
        ).items
        # Job di detail proyek urut tanggal dibuat (paling awal di atas).
        jobs = sorted(jobs, key=lambda j: j.created_at)
        # Satu proyek hanya boleh di satu tagihan aktif (BATASAN di database),
        # jadi tagihan job mana pun yang sudah ditagih = tagihan proyek ini.
        ditagih = next((j for j in jobs if j.invoice_id), None)
        ringkas = _to_ringkas(
            {
                **row,
                **(await self._unit_dan_penawaran(jobs)),
                "customer_nama": (first(row.get("customer")) or {}).get("nama_perusahaan"),
                "created_by_nama": (first(row.get("pembuat")) or {}).get("nama"),
                "jumlah_job": len(jobs),
                "jumlah_job_selesai": sum(1 for j in jobs if j.status == "selesai"),
                "jumlah_job_batal": sum(1 for j in jobs if j.status == "cancelled"),
                "invoice_id": ditagih.invoice_id if ditagih else None,
                "invoice_number": ditagih.invoice_number if ditagih else None,
            }
        )
        tagihan = await self._tagihan(proyek_id, lengkap=tagihan_lengkap) if dengan_tagihan else []
        biaya_job = await self._biaya_job(jobs)
        return ProyekDetail(**ringkas.model_dump(), jobs=jobs, tagihan=tagihan, biaya_job=biaya_job)

    async def _biaya_job(self, jobs: list[Job]) -> dict[str, ProyekBiayaJob]:
        """Uang jalan (memakai hitung_ringkasan yang sama dengan kartu Uang
        jalan detail job) & total biaya lain tiap job proyek."""
        ids = [j.id for j in jobs]
        if not ids:
            return {}
        uj_res = await (
            self._db.table("uang_jalan").select("job_id, jenis, jumlah, status_approval").in_("job_id", ids).execute()
        )
        bl_res = await self._db.table("biaya_lain").select("job_id, nominal").in_("job_id", ids).execute()
        transaksi: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in rows(uj_res):
            transaksi[r["job_id"]].append(r)
        biaya_lain: dict[str, float] = defaultdict(float)
        for r in rows(bl_res):
            biaya_lain[r["job_id"]] += num(r.get("nominal"))
        hasil: dict[str, ProyekBiayaJob] = {}
        for j in jobs:
            ringkas = hitung_ringkasan(
                j.uang_jalan_awal or 0.0,
                [
                    TransaksiRingkas(
                        jenis=t["jenis"],
                        jumlah=num(t.get("jumlah")),
                        status_approval=t.get("status_approval") or "disetujui",
                    )
                    for t in transaksi[j.id]
                ],
            )
            hasil[j.id] = ProyekBiayaJob(
                uang_jalan=ringkas.uang_jalan, cair=ringkas.cair, sisa=ringkas.sisa, biaya_lain=biaya_lain[j.id]
            )
        return hasil

    async def _tagihan(self, proyek_id: str, *, lengkap: bool) -> list[ProyekTagihan]:
        """Semua tagihan yang memuat job proyek ini — termasuk yang dibatalkan
        (rincian job tagihan batal tetap tersimpan) — urut dibuat paling awal.
        Tagihan yang terhapus (soft delete) tidak ikut."""
        from app.modules.invoices.service import derive_tampil, status_bayar

        res = await (
            self._db.table("invoice_items")
            .select(
                "invoice:invoices!inner(id, invoice_number, tanggal, created_at, status_tagihan, jatuh_tempo,"
                " total, dibayar, alasan_batal), job:jobs!inner(proyek_id)"
            )
            .eq("job.proyek_id", proyek_id)
            .eq("status", AKTIF)
            .eq("invoice.status", AKTIF)
            .execute()
        )
        per_id: dict[str, dict[str, Any]] = {}
        for r in rows(res):
            inv = first(r.get("invoice"))
            if inv:
                per_id.setdefault(inv["id"], inv)
        hasil: list[ProyekTagihan] = []
        for inv in sorted(per_id.values(), key=lambda i: str(i.get("created_at") or "")):
            total, dibayar = num(inv.get("total")), num(inv.get("dibayar"))
            tampil, _ = derive_tampil(inv["status_tagihan"], inv.get("jatuh_tempo"))
            hasil.append(
                ProyekTagihan(
                    id=inv["id"],
                    invoice_number=inv["invoice_number"],
                    tanggal=str(inv["tanggal"]),
                    created_at=str(inv["created_at"]),
                    status_tampil=tampil,  # type: ignore[arg-type]
                    status_bayar=status_bayar(total, dibayar),  # type: ignore[arg-type]
                    alasan_batal=inv.get("alasan_batal"),
                    # Admin: nomor & status saja, tanpa nominal (sama dengan info tagihan job).
                    total=total if lengkap else None,
                    dibayar=dibayar if lengkap else None,
                    sisa=total - dibayar if lengkap else None,
                )
            )
        return hasil

    async def _unit_dan_penawaran(self, jobs: list[Job]) -> dict[str, str | None]:
        """Kode unit (bisa >1 setelah ganti unit) & nomor penawaran proyek."""
        unit_ids = sorted({j.unit_id for j in jobs if j.unit_id})
        kode: list[str] = []
        if unit_ids:
            res = await self._db.table("units").select("id, kode_unit").in_("id", unit_ids).execute()
            kode = sorted(r["kode_unit"] for r in rows(res))
        quote = next((j.quotation_number for j in jobs if j.quotation_number), None)
        return {"unit_kode": ", ".join(kode) or None, "quote_number": quote}

    async def cari_untuk_penawaran(self, quotation_id: str, unit_id: str) -> ProyekCari | None:
        """Proyek dari penawaran ini yang memakai unit ini (termasuk unit job
        pengganti) — untuk tombol "Gabung Proyek" di item penawaran. Proyek
        terbaru yang dipilih bila ada lebih dari satu.

        BATASAN: proyek yang sudah masuk tagihan aktif dilewati — tidak bisa
        ditambah job, jadi job dari penawaran itu masuk proyek baru."""
        res = await (
            self._db.table("jobs")
            .select("proyek_id, created_at, proyek:proyek!inner(id, nomor_proyek)")
            .eq("quotation_id", quotation_id)
            .eq("unit_id", unit_id)
            .neq("status_job", "cancelled")
            .order("created_at", desc=True)
            .execute()
        )
        kandidat: dict[str, dict[str, Any]] = {}
        for r in rows(res):
            proyek = first(r.get("proyek")) or {}
            if proyek.get("id"):
                kandidat.setdefault(str(proyek["id"]), proyek)
        if not kandidat:
            return None
        ditagih = await self._proyek_ditagih(list(kandidat))
        for pid, proyek in kandidat.items():
            if pid not in ditagih:
                return ProyekCari(id=proyek["id"], nomor_proyek=proyek["nomor_proyek"])
        return None

    async def _proyek_ditagih(self, proyek_ids: list[str]) -> set[str]:
        """Proyek yang sudah masuk tagihan aktif (tidak batal)."""
        res = await (
            self._db.table("invoice_items")
            .select("job:jobs!inner(proyek_id), invoice:invoices!inner(id)")
            .in_("job.proyek_id", proyek_ids)
            .eq("job.status", AKTIF)
            .eq("invoice.status", AKTIF)
            .neq("invoice.status_tagihan", "batal")
            .execute()
        )
        return {str(pid) for r in rows(res) if (pid := (first(r.get("job")) or {}).get("proyek_id"))}

    async def _cek_job_baru_sesuai_proyek(self, proyek_id: str, jobs: list[JobCreate]) -> None:
        """BATASAN: job baru yang digabung ke proyek wajib satu penawaran dan
        memakai salah satu unit proyek (database juga menjaga)."""
        if not jobs:
            return
        res = await (
            self._db.table("jobs")
            .select("unit_id, quotation_id, proyek:proyek(nomor_proyek)")
            .eq("proyek_id", proyek_id)
            .neq("status_job", "cancelled")
            .execute()
        )
        ada = rows(res)
        if not ada:
            _cek_satu_unit_satu_penawaran(jobs)
            return
        nomor = (first(ada[0].get("proyek")) or {}).get("nomor_proyek") or ""
        unit_proyek = {r["unit_id"] for r in ada}
        penawaran_proyek = {r.get("quotation_id") for r in ada}
        for j in jobs:
            if (j.quotation_id or None) not in penawaran_proyek:
                raise ValidationError(f"Job ini tidak bisa digabung ke proyek {nomor} — penawarannya berbeda.")
            if j.unit_id not in unit_proyek:
                raise ValidationError(f"Unit job harus sama dengan unit proyek {nomor}. Unit lain → buat proyek baru.")

    # ── Tulis ───────────────────────────────────────────────────────────────

    async def create(self, payload: ProyekCreate, *, created_by: str | None) -> ProyekCreated:
        """Proyek baru + semua jobnya dalam SATU transaksi (BEGIN → COMMIT,
        atau ROLLBACK semuanya bila satu langkah gagal — nomor proyek ikut batal)."""
        _cek_satu_unit_satu_penawaran(payload.jobs)
        # Aturan job baru (jadwal, bentrok, item penawaran, rute) sama persis
        # dengan jalur lain; job dalam satu form juga tidak boleh saling bentrok.
        data_jobs = await self._jobs.siapkan_banyak(payload.jobs, created_by=created_by)

        tx = Transaksi(self._db)
        proyek = tx.insert(
            "proyek",
            {
                "customer_id": payload.customer_id,
                "pic_nama": payload.pic_nama,
                "pic_no_hp": payload.pic_no_hp,
                "created_by": created_by,
            },
        )
        await self._pasang_sales(tx, payload.jobs, data_jobs, created_by=created_by)
        self._tambah_jobs(tx, proyek["id"], data_jobs)
        hasil = await tx.jalankan()

        proyek_row, job_rows = hasil[0][0], _baris_job(hasil, len(data_jobs))
        await self._kabari_driver(job_rows, payload.jobs)
        return ProyekCreated(
            id=proyek_row["id"], nomor_proyek=proyek_row["nomor_proyek"], jobs=[_job_created(r) for r in job_rows]
        )

    async def update(self, proyek_id: str, payload: ProyekUpdate, *, created_by: str | None) -> ProyekUpdated:
        """Ubah customer/PIC proyek dan tambahkan job baru — satu transaksi.
        Customer tidak bisa diganti bila proyek sudah masuk tagihan (dijaga database)."""
        if payload.jobs_baru:
            await self._jobs.tolak_bila_proyek_ditagih(proyek_id)
        await self._cek_job_baru_sesuai_proyek(proyek_id, payload.jobs_baru)
        data_jobs = await self._jobs.siapkan_banyak(payload.jobs_baru, created_by=created_by)

        tx = Transaksi(self._db)
        tx.update(
            "proyek",
            {"customer_id": payload.customer_id, "pic_nama": payload.pic_nama, "pic_no_hp": payload.pic_no_hp},
            {"id": proyek_id},
        )
        await self._pasang_sales(tx, payload.jobs_baru, data_jobs, created_by=created_by)
        self._tambah_jobs(tx, proyek_id, data_jobs)
        hasil = await tx.jalankan()

        job_rows = _baris_job(hasil, len(data_jobs))
        await self._kabari_driver(job_rows, payload.jobs_baru)
        return ProyekUpdated(jobs_baru=[_job_created(r) for r in job_rows])

    async def _pasang_sales(
        self, tx: Transaksi, payloads: list[JobCreate], data_jobs: list[dict[str, Any]], *, created_by: str | None
    ) -> None:
        """Isi `sales_id` tiap job; sales baru (nama diketik) masuk transaksi yang sama."""
        sales_ids = await SalesService(self._db).siapkan(tx, list(payloads), created_by=created_by)
        for data, sales_id in zip(data_jobs, sales_ids, strict=True):
            data["sales_id"] = sales_id

    @staticmethod
    def _tambah_jobs(tx: Transaksi, proyek_id: str, data_jobs: list[dict[str, Any]]) -> None:
        """`proyek_id` boleh rujukan langkah sebelumnya (mis. `proyek["id"]`).
        Satu langkah per job supaya nomor job hasilnya bisa dibaca per job."""
        for data in data_jobs:
            tx.insert("jobs", {**data, "proyek_id": proyek_id})

    async def _kabari_driver(self, job_rows: list[dict[str, Any]], payloads: list[JobCreate]) -> None:
        """Push ke driver setelah semuanya tersimpan (bukan di tengah transaksi)."""
        for row, payload in zip(job_rows, payloads, strict=True):
            await self._jobs.kabari_driver(row, payload)

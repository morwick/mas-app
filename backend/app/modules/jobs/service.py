from __future__ import annotations

from datetime import timedelta
from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import AppError, NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, escape_like, ilike_any
from app.core.pg import clean_text, first, num, num_or_none, rows, single
from app.core.push import push_to_driver
from app.core.soft_delete import AKTIF
from app.core.timeutil import add_days, iso_utc, parse_date, parse_iso, today_wib
from app.core.transaksi import Transaksi
from app.domain.job_conflicts import (
    ACTIVE_JOB_STATUSES,
    ConflictCandidate,
    ConflictCheckResult,
    ScheduledJob,
    find_job_conflicts,
)
from app.integrations.routing.openrouteservice import try_get_route
from app.modules.jobs.mappers import JOB_SELECT, active_children, to_job
from app.modules.jobs.schemas import (
    ActiveJobByUnit,
    CancelRequest,
    ConflictCheckRequest,
    GantiDriverRequest,
    GantiTrailerRequest,
    GantiTrukEntry,
    GantiUnitRequest,
    GantiUnitUlangRequest,
    Job,
    JobCreate,
    JobCreated,
    JobListFilter,
    JobStatusHistoryEntry,
    JobUpdate,
    ReturnJobRequest,
    UpdateStatusRequest,
)

_GANTI_TRUK_SELECT = """
  id, jenis, diganti_pada, status_job_saat_ganti, alasan, uang_jalan_dikembalikan, kasbon, job_pengganti_id,
  pengganti:jobs!job_ganti_unit_job_pengganti_id_fkey(job_number, status_job),
  unit_lama:units!job_ganti_unit_unit_lama_id_fkey(kode_unit),
  unit_baru:units!job_ganti_unit_unit_baru_id_fkey(kode_unit),
  driver_lama:drivers!job_ganti_unit_driver_lama_id_fkey(nama),
  driver_baru:drivers!job_ganti_unit_driver_baru_id_fkey(nama),
  trailer_lama:unit_trailer!job_ganti_unit_unit_trailer_lama_id_fkey(kode_trailer),
  trailer_baru:unit_trailer!job_ganti_unit_unit_trailer_baru_id_fkey(kode_trailer),
  oleh:profiles!job_ganti_unit_diganti_oleh_fkey(nama)
"""


def _to_ganti_truk(r: dict[str, Any]) -> GantiTrukEntry:
    def ambil(alias: str, kolom: str) -> str | None:
        return (first(r.get(alias)) or {}).get(kolom)

    return GantiTrukEntry(
        id=r["id"],
        jenis=r.get("jenis") or "ganti_truk",
        diganti_pada=r["diganti_pada"],
        status_job_saat_ganti=r["status_job_saat_ganti"],
        alasan=r["alasan"],
        unit_lama_kode=ambil("unit_lama", "kode_unit"),
        unit_baru_kode=ambil("unit_baru", "kode_unit"),
        driver_lama_nama=ambil("driver_lama", "nama"),
        driver_baru_nama=ambil("driver_baru", "nama"),
        unit_trailer_lama_kode=ambil("trailer_lama", "kode_trailer"),
        unit_trailer_baru_kode=ambil("trailer_baru", "kode_trailer"),
        diganti_oleh_nama=ambil("oleh", "nama"),
        uang_jalan_dikembalikan=num(r.get("uang_jalan_dikembalikan")),
        kasbon=num(r.get("kasbon")),
        job_pengganti_id=r.get("job_pengganti_id"),
        job_pengganti_number=ambil("pengganti", "job_number"),
        job_pengganti_status=ambil("pengganti", "status_job"),
    )


BENTROK_JADWAL_MESSAGE = "Gagal! Ada bentrok jadwal. Silakan dicek kembali."


class JobConflictError(AppError):
    """Bentrok jadwal — 409 dengan daftar job yang beririsan. Job tidak disimpan."""

    status_code = 409

    def __init__(self, conflicts: ConflictCheckResult) -> None:
        super().__init__(BENTROK_JADWAL_MESSAGE, extra={"conflicts": conflicts.model_dump()})
        self.conflicts = conflicts


def _to_iso(value: str) -> str:
    return iso_utc(parse_iso(value))


def _reject_back_dated_etd(etd: str) -> None:
    """ETD tidak boleh mundur ke tanggal yang sudah lewat (jam bebas).

    Dibandingkan sebagai tanggal kalender apa adanya — bukan sebagai instan —
    supaya hasilnya sama dengan tanggal yang dipilih admin di browser.
    """
    if parse_date(etd) < today_wib():
        raise ValidationError("Tanggal pickup (ETD) tidak boleh tanggal yang sudah lewat.")


def _derive_eta(*, etd: str, eta: str | None, duration_min: float | None) -> tuple[str | None, bool]:
    """Tentukan ETA yang disimpan beserta penanda "perkiraan sistem".

    ETA yang diisi admin selalu menang. Bila dikosongkan, sistem mengisinya
    dari durasi rute — itu yang dijanjikan hint di form. Tanpa durasi rute
    (koordinat belum dipin, atau ORS gagal) ETA dibiarkan kosong, bukan ditebak.
    """
    if eta and eta.strip():
        return _to_iso(eta), False
    if duration_min is None:
        return None, False
    return iso_utc(parse_iso(etd) + timedelta(minutes=duration_min)), True


ETA_TIDAK_TERHITUNG_MESSAGE = (
    "Gagal! Sistem tidak bisa menghitung ETA dari rute yang dipilih. Silakan isi ETA secara manual."
)


def _require_eta(eta_iso: str | None) -> None:
    """ETA wajib ada: dari isian admin, atau dihitung dari durasi rute.

    Bila rute tidak ditemukan (mis. beda pulau tanpa jalur ferry di data peta)
    dan admin mengosongkan ETA, job ditolak — jadwal tanpa ETA membuat cek
    bentrok unit/driver dan papan jadwal hanya menebak.
    """
    if not eta_iso:
        raise ValidationError(ETA_TIDAK_TERHITUNG_MESSAGE)


def _reject_eta_before_etd(etd: str, eta: str | None) -> None:
    if eta and parse_iso(eta) < parse_iso(etd):
        raise ValidationError("Estimasi sampai (ETA) tidak boleh lebih awal dari ETD.")


class JobService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Baca ────────────────────────────────────────────────────────────────

    # Kolom yang ikut dicari dari kotak pencarian daftar job.
    # Hanya kolom milik tabel jobs. `customer_nama` datang dari embed
    # customers dan tidak bisa ikut ke dalam grup `or=` yang sama.
    _SEARCH_COLUMNS = ["job_number", "alat_diangkut", "asal", "tujuan"]

    def _list_query(
        self,
        *,
        status: JobListFilter,
        customer_id: str | None,
        q: str | None,
        select: str,
        proyek_id: str | None = None,
        quotation_ids: list[str] | None = None,
        proyek_ids: list[str] | None = None,
        count: CountMethod | None = None,
        head: bool = False,
    ):
        """Query daftar job dengan seluruh filternya — dipakai bersama oleh
        pengambilan halaman dan penghitungan baris, supaya keduanya tidak
        pernah memakai kriteria yang berbeda."""
        if customer_id:
            # Customer tersimpan di proyek: embed proyek dijadikan inner join
            # supaya filter customer menyaring baris job, bukan hanya embed-nya.
            select = (
                select.replace("proyek:proyek(", "proyek:proyek!inner(", 1)
                if "proyek:proyek(" in select
                else f"{select}, proyek:proyek!inner(customer_id)"
            )
        query = (
            self._db.table("jobs").select(select, count=count, head=head)
            if count is not None
            else self._db.table("jobs").select(select)
        )
        query = active_children(query, select)
        if status == "active":
            query = query.in_("status_job", list(ACTIVE_JOB_STATUSES))
        elif status in ("menunggu_validasi", "selesai", "cancelled"):
            query = query.eq("status_job", status)
        if customer_id:
            query = query.eq("proyek.customer_id", customer_id)
        if proyek_id:
            query = query.eq("proyek_id", proyek_id)
        if q and q.strip():
            filters = ilike_any(self._SEARCH_COLUMNS, q)
            if quotation_ids:
                filters += f",quotation_id.in.({','.join(quotation_ids)})"
            if proyek_ids:
                filters += f",proyek_id.in.({','.join(proyek_ids)})"
            query = query.or_(filters)
        return query

    async def _quotation_ids_matching(self, q: str | None) -> list[str]:
        """Id penawaran yang nomor suratnya cocok dengan pencarian — nomor
        penawaran ada di tabel lain, jadi dicari dulu lalu ikut ke grup `or=`."""
        if not q or not q.strip():
            return []
        res = await (
            self._db.table("quotations")
            .select("id")
            .ilike("quote_number", f"%{escape_like(q.strip())}%")
            .limit(200)
            .execute()
        )
        return [r["id"] for r in rows(res)]

    async def _proyek_ids_matching(self, q: str | None) -> list[str]:
        """Id proyek yang nomor / PIC-nya cocok dengan pencarian — sama seperti
        nomor penawaran, dicari dulu lalu ikut ke grup `or=`."""
        if not q or not q.strip():
            return []
        res = await (
            self._db.table("proyek").select("id").or_(ilike_any(["nomor_proyek", "pic_nama"], q)).limit(200).execute()
        )
        return [r["id"] for r in rows(res)]

    async def lampirkan_penggantian(self, jobs: list[Job]) -> list[Job]:
        """Isi tautan ganti unit: job pengganti ↔ job lama — satu query per halaman."""
        ids = [j.id for j in jobs]
        if not ids:
            return jobs
        lama_ids = [j.menggantikan_job_id for j in jobs if j.menggantikan_job_id]
        filter_or = f"menggantikan_job_id.in.({','.join(ids)})"
        if lama_ids:
            filter_or += f",id.in.({','.join(lama_ids)})"
        res = await self._db.table("jobs").select("id, job_number, menggantikan_job_id").or_(filter_or).execute()
        nomor = {r["id"]: r["job_number"] for r in rows(res)}
        pengganti = {r["menggantikan_job_id"]: r for r in rows(res) if r.get("menggantikan_job_id")}
        for j in jobs:
            if j.menggantikan_job_id:
                j.menggantikan_job_number = nomor.get(j.menggantikan_job_id)
            p = pengganti.get(j.id)
            if p:
                j.diganti_oleh_job_id = p["id"]
                j.diganti_oleh_job_number = p["job_number"]
        return jobs

    async def _lampirkan_tagihan(self, jobs: list[Job], *, lengkap: bool = False) -> list[Job]:
        """Isi info tagihan per job — satu query untuk semua job di halaman.
        Admin: nomor & status bayar. `lengkap` (superadmin): ditambah status
        tagihan & sisa nominal. Tagihan batal / terhapus tidak dihitung."""
        from app.modules.invoices.service import derive_tampil, status_bayar

        ids = [j.id for j in jobs]
        if not ids:
            return jobs
        res = await (
            self._db.table("invoice_items")
            .select("job_id, invoice:invoices!inner(id, invoice_number, total, dibayar, status_tagihan, jatuh_tempo)")
            .in_("job_id", ids)
            .eq("status", AKTIF)
            .eq("invoice.status", AKTIF)
            .neq("invoice.status_tagihan", "batal")
            .execute()
        )
        per_job: dict[str, dict[str, Any]] = {}
        for r in rows(res):
            inv = first(r.get("invoice"))
            if r.get("job_id") and inv:
                per_job[r["job_id"]] = inv
        for j in jobs:
            j.info_tagihan = True
            inv = per_job.get(j.id)
            if not inv:
                continue
            total, dibayar = num(inv.get("total")), num(inv.get("dibayar"))
            j.invoice_id = inv["id"]
            j.invoice_number = inv["invoice_number"]
            j.invoice_status_bayar = status_bayar(total, dibayar)
            if lengkap:
                tampil, terlambat = derive_tampil(inv["status_tagihan"], inv.get("jatuh_tempo"))
                j.invoice_status_tampil = tampil
                j.invoice_hari_terlambat = terlambat
                j.invoice_sisa = total - dibayar
        return jobs

    async def list_page(
        self,
        *,
        params: PageParams,
        status: JobListFilter = "all",
        customer_id: str | None = None,
        proyek_id: str | None = None,
        q: str | None = None,
        dengan_tagihan: bool = False,
        tagihan_lengkap: bool = False,
    ) -> Page[Job]:
        """Satu halaman job. Pencarian & filter dijalankan di database — kalau
        disaring di browser, yang tersaring hanya halaman yang sedang tampil."""
        query = self._list_query(
            status=status,
            customer_id=customer_id,
            proyek_id=proyek_id,
            q=q,
            select=JOB_SELECT,
            count=CountMethod.exact,
            quotation_ids=await self._quotation_ids_matching(q),
            proyek_ids=await self._proyek_ids_matching(q),
        )
        res = await apply_window(query.order("created_at", desc=True), params).execute()
        jobs = await self.lampirkan_penggantian([to_job(r) for r in rows(res)])
        if dengan_tagihan:
            jobs = await self._lampirkan_tagihan(jobs, lengkap=tagihan_lengkap)
        return build_page(jobs, res.count, params)

    async def list_all(
        self, *, status: JobListFilter = "all", customer_id: str | None = None, proyek_id: str | None = None
    ) -> list[Job]:
        """Seluruh baris tanpa potongan — untuk deteksi bentrok jadwal,
        ekspor, dan daftar job satu proyek."""
        query = self._list_query(status=status, customer_id=customer_id, proyek_id=proyek_id, q=None, select=JOB_SELECT)
        return [to_job(r) for r in rows(await query.order("created_at", desc=True).execute())]

    async def tab_counts(self, *, customer_id: str | None = None, q: str | None = None) -> dict[str, int]:
        """Jumlah per tab, dihitung di database dengan filter yang sama persis
        seperti daftarnya — supaya angka di tab cocok dengan isinya."""
        tabs: list[JobListFilter] = ["active", "menunggu_validasi", "selesai", "cancelled"]
        out: dict[str, int] = {}
        quotation_ids = await self._quotation_ids_matching(q)
        proyek_ids = await self._proyek_ids_matching(q)
        for tab in tabs:
            res = await self._list_query(
                status=tab,
                customer_id=customer_id,
                q=q,
                select="id",
                count=CountMethod.exact,
                head=True,
                quotation_ids=quotation_ids,
                proyek_ids=proyek_ids,
            ).execute()
            out[tab] = res.count or 0
        return out

    async def get(self, job_id: str, *, dengan_tagihan: bool = False, tagihan_lengkap: bool = False) -> Job:
        row = single(
            await active_children(self._db.table("jobs").select(JOB_SELECT), JOB_SELECT)
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise NotFoundError("Job tidak ditemukan")
        job = (await self.lampirkan_penggantian([to_job(row)]))[0]
        if not dengan_tagihan:
            return job
        return (await self._lampirkan_tagihan([job], lengkap=tagihan_lengkap))[0]

    async def count_active(self) -> int:
        res = await (
            self._db.table("jobs")
            .select("id", count=CountMethod.exact, head=True)
            .in_("status_job", list(ACTIVE_JOB_STATUSES))
            .execute()
        )
        return res.count or 0

    async def count_by_status(self, status: str) -> int:
        res = await (
            self._db.table("jobs").select("id", count=CountMethod.exact, head=True).eq("status_job", status).execute()
        )
        return res.count or 0

    async def active_by_unit(self) -> list[ActiveJobByUnit]:
        res = await (
            active_children(self._db.table("jobs").select(JOB_SELECT), JOB_SELECT)
            .in_("status_job", list(ACTIVE_JOB_STATUSES))
            .execute()
        )
        by_unit: dict[str, Job] = {}
        for r in rows(res):
            job = to_job(r)
            by_unit[job.unit_id] = job
        return [ActiveJobByUnit(unit_id=uid, job=job) for uid, job in by_unit.items()]

    async def list_by_unit(self, unit_id: str) -> list[Job]:
        return await self._list_by("unit_id", unit_id)

    async def list_by_unit_trailer(self, unit_trailer_id: str) -> list[Job]:
        return await self._list_by("unit_trailer_id", unit_trailer_id)

    async def list_by_driver(self, driver_id: str) -> list[Job]:
        return await self._list_by("driver_id", driver_id)

    async def _list_by(self, kolom: str, asset_id: str) -> list[Job]:
        res = await (
            active_children(self._db.table("jobs").select(JOB_SELECT), JOB_SELECT)
            .eq(kolom, asset_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [to_job(r) for r in rows(res)]

    async def list_in_range(self, start: str, end: str) -> list[Job]:
        """Job yang menyentuh rentang tanggal (papan jadwal).

        Job tanpa ETA dianggap satu hari sejak ETD — menganggapnya tak berujung
        akan memenuhi papan, nol menit akan menyembunyikannya.
        """
        res = await (
            active_children(self._db.table("jobs").select(JOB_SELECT), JOB_SELECT)
            .neq("status_job", "cancelled")
            # Tanggal papan jadwal = tanggal WIB; tulis offset-nya supaya tidak
            # bergantung pada zona waktu sesi database.
            .lt("etd", f"{add_days(parse_date(end), 1).isoformat()}T00:00:00+07:00")
            .order("etd")
            .execute()
        )
        start_dt = parse_iso(f"{start}T00:00:00+07:00")
        out: list[Job] = []
        for r in rows(res):
            job = to_job(r)
            akhir = parse_iso(job.eta) if job.eta else parse_iso(job.etd) + timedelta(days=1)
            if akhir >= start_dt:
                out.append(job)
        return out

    async def status_history(self, job_id: str) -> list[JobStatusHistoryEntry]:
        res = await (
            self._db.table("job_status_history")
            .select("*, profiles(nama), driver:drivers(nama)")
            .eq("job_id", job_id)
            .order("changed_at", desc=True)
            .execute()
        )
        out = []
        for r in rows(res):
            driver = first(r.get("driver")) or {}
            profile = first(r.get("profiles")) or {}
            out.append(
                JobStatusHistoryEntry(
                    id=r["id"],
                    job_id=r["job_id"],
                    status_old=r.get("status_old"),
                    status_new=r["status_new"],
                    changed_by_nama=driver.get("nama") or profile.get("nama") or "Sistem",
                    changed_by_driver=bool(r.get("changed_by_driver")),
                    changed_at=r["changed_at"],
                    notes=r.get("notes"),
                )
            )
        return out

    # ── Bentrok jadwal ──────────────────────────────────────────────────────

    async def check_conflicts(
        self, payload: ConflictCheckRequest, *, bersama: list[ScheduledJob] | None = None
    ) -> ConflictCheckResult:
        """Bentrok dengan job aktif, ditambah `bersama` (job baru lain di form yang sama)."""
        active = await self.list_all(status="active")
        return find_job_conflicts(
            ConflictCandidate(
                unit_id=payload.unit_id,
                driver_id=payload.driver_id,
                etd=payload.etd,
                eta=payload.eta,
                exclude_job_id=payload.exclude_job_id,
            ),
            [
                ScheduledJob(
                    id=j.id,
                    job_number=j.job_number,
                    customer_nama=j.customer_nama,
                    unit_id=j.unit_id,
                    driver_id=j.driver_id,
                    etd=j.etd,
                    eta=j.eta,
                    status=j.status,
                )
                for j in active
            ]
            + (bersama or []),
        )

    async def _reject_if_conflicting(
        self, payload: ConflictCheckRequest, *, bersama: list[ScheduledJob] | None = None
    ) -> None:
        conflicts = await self.check_conflicts(payload, bersama=bersama)
        if conflicts.has_any:
            raise JobConflictError(conflicts)

    # ── Tulis ───────────────────────────────────────────────────────────────

    async def _item_penawaran(self, payload: JobCreate) -> tuple[str | None, str | None]:
        """Job dari penawaran dibuat per item yang deal. Kembalikan
        (quotation_id, quotation_item_id) yang sudah diperiksa."""
        if not payload.quotation_id and not payload.quotation_item_id:
            return None, None
        if payload.quotation_item_id:
            item = single(
                await self._db.table("quotation_items")
                .select("id, quotation_id, keputusan")
                .eq("id", payload.quotation_item_id)
                .maybe_single()
                .execute()
            )
            if item is None:
                raise NotFoundError("Item penawaran tidak ditemukan")
            if payload.quotation_id and payload.quotation_id != item["quotation_id"]:
                raise ValidationError("Item penawaran bukan milik penawaran yang dipilih.")
            quotation_id = item["quotation_id"]
            deal = [item] if item["keputusan"] == "deal" else []
        else:
            quotation_id = payload.quotation_id
            deal = rows(
                await self._db.table("quotation_items")
                .select("id")
                .eq("quotation_id", quotation_id)
                .eq("keputusan", "deal")
                .execute()
            )
            if len(deal) > 1:
                raise ValidationError("Penawaran ini punya beberapa item deal — pilih item yang dibuatkan job.")
        q = single(
            await self._db.table("quotations")
            .select("status_penawaran, quote_number")
            .eq("id", quotation_id)
            .maybe_single()
            .execute()
        )
        if q is None:
            raise NotFoundError("Penawaran tidak ditemukan")
        # Yang menentukan adalah keputusan ITEM (deal), bukan status surat:
        # item deal boleh dibuatkan job walau item lain masih menunggu.
        if not deal:
            raise ValidationError(
                f"Job hanya bisa dibuat dari item penawaran {q['quote_number']} yang disetujui (deal)."
            )
        return quotation_id, deal[0]["id"]

    async def proyek_aktif(self, proyek_id: str) -> dict[str, Any]:
        """Proyek tujuan job baru — harus ada dan belum dihapus."""
        proyek = single(
            await self._db.table("proyek")
            .select("id, nomor_proyek, customer_id")
            .eq("id", proyek_id)
            .maybe_single()
            .execute()
        )
        if proyek is None:
            raise NotFoundError("Proyek tidak ditemukan")
        return proyek

    async def create(self, payload: JobCreate, *, created_by: str | None) -> JobCreated:
        """Tambah job ke proyek yang sudah ada. Job pertama proyek baru dibuat
        bersama proyeknya lewat ProyekService.create (satu transaksi)."""
        # BATASAN: job wajib masuk proyek (database juga menolak — trigger
        # jobs_cek_proyek). Customer & PIC mengikuti proyek.
        if not payload.proyek_id:
            raise ValidationError("Job wajib masuk proyek. Buat proyek baru atau tambahkan job dari halaman proyek.")
        await self.proyek_aktif(payload.proyek_id)

        data = await self.siapkan_baris(payload, created_by=created_by)
        data["proyek_id"] = payload.proyek_id
        row = rows(await self._db.table("jobs").insert(data).execute())[0]
        await self.kabari_driver(row, payload)
        return JobCreated(id=row["id"], job_number=row["job_number"], share_token=row["share_token"])

    async def siapkan_banyak(self, payloads: list[JobCreate], *, created_by: str | None) -> list[dict[str, Any]]:
        """Siapkan beberapa job baru sekaligus (form proyek). Selain bentrok
        dengan job aktif, job dalam satu form juga tidak boleh saling bentrok
        unit / driver-nya."""
        hasil: list[dict[str, Any]] = []
        sebelumnya: list[ScheduledJob] = []
        for i, payload in enumerate(payloads, start=1):
            data = await self.siapkan_baris(payload, created_by=created_by, bersama=sebelumnya)
            hasil.append(data)
            sebelumnya.append(
                ScheduledJob(
                    id=f"baru-{i}",
                    job_number=f"Job baru ke-{i} di form ini",
                    customer_nama="",
                    unit_id=payload.unit_id,
                    driver_id=payload.driver_id,
                    etd=data["etd"],
                    eta=data["eta"],
                    status="ditugaskan",
                )
            )
        return hasil

    async def siapkan_baris(
        self,
        payload: JobCreate,
        *,
        created_by: str | None,
        bersama: list[ScheduledJob] | None = None,
        kecuali_job_id: str | None = None,
    ) -> dict[str, Any]:
        """Validasi isian job baru lalu susun baris `jobs` (tanpa proyek_id).

        Dipakai bersama oleh tambah job ke proyek dan form proyek, supaya
        aturan job baru (jadwal, bentrok, item penawaran, rute) sama persis
        di semua jalur. `bersama` = job lain yang disimpan dalam form yang sama."""
        _reject_back_dated_etd(payload.etd)
        _reject_eta_before_etd(payload.etd, payload.eta)

        quotation_id, quotation_item_id = await self._item_penawaran(payload)

        # Bentrok jadwal unit/driver selalu ditolak — tidak ada "tetap simpan".
        await self._reject_if_conflicting(
            ConflictCheckRequest(
                unit_id=payload.unit_id,
                driver_id=payload.driver_id,
                etd=payload.etd,
                eta=payload.eta,
                # Ganti unit: job lama (yang digantikan) tidak dianggap bentrok.
                exclude_job_id=kecuali_job_id,
            ),
            bersama=bersama,
        )

        route = await try_get_route(payload.asal_lat, payload.asal_lng, payload.tujuan_lat, payload.tujuan_lng)
        # FR-JOB-03: ETA kosong diisi dari durasi rute dan ditandai estimasi sistem.
        eta_iso, eta_is_estimated = _derive_eta(
            etd=payload.etd, eta=payload.eta, duration_min=route.duration_min if route else None
        )
        _require_eta(eta_iso)
        data = {
            "alat_diangkut": payload.alat_diangkut.strip(),
            "asal": payload.asal.strip(),
            "tujuan": payload.tujuan.strip(),
            "asal_lat": payload.asal_lat,
            "asal_lng": payload.asal_lng,
            "tujuan_lat": payload.tujuan_lat,
            "tujuan_lng": payload.tujuan_lng,
            "route_polyline": route.polyline if route else None,
            "route_distance_km": route.distance_km if route else None,
            "route_duration_min": route.duration_min if route else None,
            "unit_id": payload.unit_id,
            "unit_trailer_id": payload.unit_trailer_id or None,
            "driver_id": payload.driver_id,
            "etd": _to_iso(payload.etd),
            "eta": eta_iso,
            "eta_is_estimated": eta_is_estimated,
            "uang_jalan_awal": payload.uang_jalan_awal,
            "catatan": clean_text(payload.catatan),
            "quotation_id": quotation_id,
            "quotation_item_id": quotation_item_id,
            "created_by": created_by,
        }
        return data

    async def kabari_driver(self, row: dict[str, Any], payload: JobCreate) -> None:
        """Push notifikasi job baru ke driver — setelah job tersimpan."""
        await push_to_driver(
            payload.driver_id,
            title="Job baru untuk Anda",
            body=f"{row['job_number']} — {payload.asal.strip()} → {payload.tujuan.strip()}",
            data={"job_id": row["id"], "kind": "job_baru"},
        )

    async def update(self, job_id: str, payload: JobUpdate) -> None:
        fields = payload.model_dump(exclude_unset=True)
        touches_schedule = any(k in fields for k in ("unit_id", "driver_id", "etd", "eta"))

        current: dict[str, Any] | None = None
        if touches_schedule or _coords_changed(fields):
            current = single(
                await self._db.table("jobs")
                .select(
                    "job_number, status_job, unit_id, driver_id, etd, eta, eta_is_estimated, "
                    "route_duration_min, asal, tujuan, "
                    "asal_lat, asal_lng, tujuan_lat, tujuan_lng"
                )
                .eq("id", job_id)
                .maybe_single()
                .execute()
            )
            if current is None:
                raise NotFoundError("Job tidak ditemukan")

        await self._tolak_ganti_penugasan_bila_sudah_cair(job_id, fields)

        if touches_schedule and current is not None:
            # ETD/ETA dibandingkan setelah digabung dengan nilai tersimpan, supaya
            # mengubah salah satunya saja tetap terjaga urutannya.
            merged_etd = payload.etd or current["etd"]
            merged_eta = fields["eta"] if "eta" in fields else current.get("eta")
            _reject_eta_before_etd(merged_etd, merged_eta)
            # Larangan back-date sengaja tidak diterapkan di sini: job yang sudah
            # berjalan wajar punya ETD di masa lalu, dan form edit selalu mengirim
            # ulang ETD lama apa adanya.

        if touches_schedule and current is not None:
            await self._reject_if_conflicting(
                ConflictCheckRequest(
                    unit_id=payload.unit_id or current["unit_id"],
                    driver_id=payload.driver_id or current["driver_id"],
                    etd=payload.etd or current["etd"],
                    eta=fields["eta"] if "eta" in fields else current.get("eta"),
                    exclude_job_id=job_id,
                )
            )

        data: dict[str, Any] = {}
        # Diisi hanya bila rute diambil ulang di bawah; None berarti pakai
        # durasi yang sudah tersimpan.
        durasi_baru: float | None = None
        for key in ("alat_diangkut", "asal", "tujuan"):
            if fields.get(key):
                data[key] = fields[key].strip()
        for key in ("unit_id", "driver_id"):
            if fields.get(key):
                data[key] = fields[key]
        if "unit_trailer_id" in fields:
            data["unit_trailer_id"] = fields["unit_trailer_id"] or None
        if fields.get("etd"):
            data["etd"] = _to_iso(fields["etd"])
        if "catatan" in fields:
            data["catatan"] = clean_text(fields["catatan"])

        # Koordinat berubah → rute diambil ulang; titik yang tidak diubah pakai nilai lama.
        if _coords_changed(fields) and current is not None:
            coords = {
                key: fields[key] if key in fields else num_or_none(current.get(key))
                for key in ("asal_lat", "asal_lng", "tujuan_lat", "tujuan_lng")
            }
            data.update(coords)
            route = await try_get_route(
                coords["asal_lat"], coords["asal_lng"], coords["tujuan_lat"], coords["tujuan_lng"]
            )
            data["route_polyline"] = route.polyline if route else None
            data["route_distance_km"] = route.distance_km if route else None
            data["route_duration_min"] = route.duration_min if route else None
            durasi_baru = route.duration_min if route else None

        # ETA diturunkan di sini, bukan saat membaca `fields`, karena butuh
        # durasi rute yang baru diambil di atas. Sebelumnya bagian ini hanya
        # menyalin isian admin — dikosongkan berarti ETA hilang dan tidak
        # pernah dihitung sistem, padahal form menjanjikan sebaliknya.
        if "eta" in fields or _coords_changed(fields) or "etd" in fields:
            etd_final = payload.etd or (current or {}).get("etd") or ""
            eta_input = fields["eta"] if "eta" in fields else None
            # ETA tersimpan yang berasal dari isian admin tetap dipertahankan
            # saat admin hanya mengubah hal lain.
            if "eta" not in fields and current and not current.get("eta_is_estimated"):
                eta_input = current.get("eta")
            durasi = durasi_baru if durasi_baru is not None else num_or_none((current or {}).get("route_duration_min"))
            if etd_final:
                data["eta"], data["eta_is_estimated"] = _derive_eta(etd=etd_final, eta=eta_input, duration_min=durasi)
                _require_eta(data["eta"])

        if data:
            await self._db.table("jobs").update(data).eq("id", job_id).execute()

        await self._notify_driver_reassigned(job_id, data, current)

    async def _notify_driver_reassigned(
        self, job_id: str, data: dict[str, Any], current: dict[str, Any] | None
    ) -> None:
        """Push FCM saat job berpindah driver.

        Notifikasi in-app sudah dibuat trigger `jobs_emit_notifications`, tapi
        trigger tidak bisa mengirim push — itu dikerjakan dari sini supaya
        driver tahu meski aplikasinya sedang tertutup.

        `job_id` ikut dikirim di `data` karena aplikasi mobile memakainya untuk
        membuka langsung halaman detail job saat notifikasinya diketuk.
        """
        driver_baru = data.get("driver_id")
        if not driver_baru or current is None:
            return
        driver_lama = current.get("driver_id")
        if driver_baru == driver_lama:
            return
        # Job yang sudah usai tidak perlu diberitahukan lagi — sejalan dengan
        # syarat yang dipakai trigger di database.
        if current.get("status_job") in ("selesai", "cancelled"):
            return

        nomor = current.get("job_number") or "Job"
        rute = f"{current.get('asal') or ''} → {current.get('tujuan') or ''}".strip(" →")
        await push_to_driver(
            driver_baru,
            title="Anda ditugaskan ke job",
            body=f"{nomor}{f' — {rute}' if rute else ''}",
            data={"job_id": job_id, "kind": "job_baru"},
        )
        if driver_lama:
            # Tanpa ini driver lama bisa tetap berangkat ke titik muat.
            await push_to_driver(
                driver_lama,
                title="Job dialihkan ke driver lain",
                body=f"{nomor} tidak lagi ditugaskan kepada Anda.",
                data={"job_id": job_id, "kind": "job_dialihkan"},
            )

    async def riwayat_ganti_truk(self, job_id: str) -> list[GantiTrukEntry]:
        res = await (
            self._db.table("job_ganti_unit")
            .select(_GANTI_TRUK_SELECT)
            .eq("job_id", job_id)
            .order("diganti_pada")
            .execute()
        )
        return [_to_ganti_truk(r) for r in rows(res)]

    async def _job_untuk_ganti(self, job_id: str) -> dict[str, Any]:
        row = single(
            await self._db.table("jobs")
            .select(
                "id, job_number, driver_id, proyek_id, alat_diangkut, asal, tujuan, etd,"
                " asal_lat, asal_lng, tujuan_lat, tujuan_lng, catatan, quotation_id, quotation_item_id"
            )
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise NotFoundError("Job tidak ditemukan")
        return row

    @staticmethod
    def _rute(job: dict[str, Any]) -> str:
        return f"{job.get('asal') or ''} → {job.get('tujuan') or ''}".strip(" →")

    async def ganti_driver(self, job_id: str, payload: GantiDriverRequest) -> None:
        """Ganti driver saat job berjalan — job & proyek sama.

        Satu fungsi database = satu transaksi: riwayat, uang jalan yang
        dikembalikan supir lama, kasbon supir lama, lalu driver job diganti.
        BATASAN (database): job sedang berjalan; driver baru aktif & bebas;
        dikembalikan + kasbon ≤ uang jalan yang sudah cair."""
        lama = await self._job_untuk_ganti(job_id)
        await self._db.rpc(
            "ganti_driver_job",
            {
                "p_job_id": job_id,
                "p_driver_baru_id": payload.driver_id,
                "p_alasan": payload.alasan,
                "p_dikembalikan": payload.uang_jalan_dikembalikan,
                "p_sumber_dana_id": payload.sumber_dana_id or None,
                "p_kasbon": payload.kasbon,
            },
        ).execute()
        nomor = lama["job_number"]
        rute = self._rute(lama)
        await push_to_driver(
            payload.driver_id,
            title="Anda menggantikan driver di job",
            body=f"{nomor}{f' — {rute}' if rute else ''}",
            data={"job_id": job_id, "kind": "job_baru"},
        )
        if lama.get("driver_id"):
            await push_to_driver(
                lama["driver_id"],
                title="Job dialihkan ke driver lain",
                body=f"{nomor} dilanjutkan driver lain.",
                data={"job_id": job_id, "kind": "job_dialihkan"},
            )

    async def ganti_trailer(self, job_id: str, payload: GantiTrailerRequest) -> None:
        """Unit trailer rusak saat job berjalan — job & proyek sama; trailer
        lama dicatat insiden kerusakan (satu transaksi di database)."""
        lama = await self._job_untuk_ganti(job_id)
        await self._db.rpc(
            "ganti_trailer_job",
            {
                "p_job_id": job_id,
                "p_trailer_baru_id": payload.unit_trailer_id,
                "p_alasan": payload.alasan,
                "p_insiden_tanggal": _to_iso(payload.insiden_tanggal),
                "p_insiden_lokasi": clean_text(payload.insiden_lokasi),
                "p_insiden_deskripsi": payload.insiden_deskripsi,
            },
        ).execute()
        if lama.get("driver_id"):
            await push_to_driver(
                lama["driver_id"],
                title="Unit trailer job Anda diganti",
                body=f"{lama['job_number']}: lanjutkan perjalanan dengan unit trailer pengganti.",
                data={"job_id": job_id, "kind": "job_diubah"},
            )

    async def ganti_unit(self, job_id: str, payload: GantiUnitRequest, *, created_by: str | None) -> JobCreated:
        """Unit rusak / insiden → job pengganti (mulai dari awal) di proyek yang sama.

        Job pengganti disiapkan dengan aturan job baru yang sama (jadwal,
        bentrok, rute, item penawaran), lalu satu fungsi database menutup job
        lama sebagai Selesai ("Unit rusak - diganti JOB-xxx"), membuat job
        pengganti, mencatat insiden unit lama, pengembalian & kasbon."""
        lama = await self._job_untuk_ganti(job_id)
        # BATASAN: ETD job pengganti tidak boleh lebih awal dari ETD job awal.
        if lama.get("etd") and parse_iso(payload.etd) < parse_iso(lama["etd"]):
            raise ValidationError(
                f"ETD job pengganti tidak boleh lebih awal dari ETD job awal {lama['job_number']}."
            )
        isian = JobCreate(
            alat_diangkut=lama["alat_diangkut"],
            asal=lama["asal"],
            tujuan=lama["tujuan"],
            asal_lat=num_or_none(lama.get("asal_lat")),
            asal_lng=num_or_none(lama.get("asal_lng")),
            tujuan_lat=num_or_none(lama.get("tujuan_lat")),
            tujuan_lng=num_or_none(lama.get("tujuan_lng")),
            unit_id=payload.unit_id,
            unit_trailer_id=payload.unit_trailer_id,
            driver_id=payload.driver_id,
            etd=payload.etd,
            eta=payload.eta,
            uang_jalan_awal=payload.uang_jalan_awal,
            catatan=payload.catatan if payload.catatan is not None else lama.get("catatan"),
            quotation_id=lama.get("quotation_id"),
            quotation_item_id=lama.get("quotation_item_id"),
            proyek_id=lama["proyek_id"],
        )
        data = await self.siapkan_baris(isian, created_by=created_by, kecuali_job_id=job_id)
        res = await self._db.rpc(
            "ganti_unit_job_baru",
            {
                "p_job_id": job_id,
                "p_job_baru": data,
                "p_alasan": payload.alasan,
                "p_insiden_tanggal": _to_iso(payload.insiden_tanggal),
                "p_insiden_lokasi": clean_text(payload.insiden_lokasi),
                "p_insiden_deskripsi": payload.insiden_deskripsi,
                "p_dikembalikan": payload.uang_jalan_dikembalikan,
                "p_sumber_dana_id": payload.sumber_dana_id or None,
                "p_kasbon": payload.kasbon,
            },
        ).execute()
        baru_id = str(res.data)
        baru = single(
            await self._db.table("jobs")
            .select("id, job_number, share_token")
            .eq("id", baru_id)
            .maybe_single()
            .execute()
        )
        if baru is None:
            raise NotFoundError("Job pengganti tidak ditemukan")
        await self.kabari_driver(baru, isian)
        if lama.get("driver_id") and lama["driver_id"] != payload.driver_id:
            await push_to_driver(
                lama["driver_id"],
                title="Job ditutup — unit diganti",
                body=f"{lama['job_number']} ditutup karena unit rusak; dilanjutkan {baru['job_number']}.",
                data={"job_id": job_id, "kind": "job_dialihkan"},
            )
        return JobCreated(id=baru["id"], job_number=baru["job_number"], share_token=baru["share_token"])

    async def ganti_unit_ulang(
        self, job_id: str, payload: GantiUnitUlangRequest, *, created_by: str | None
    ) -> JobCreated:
        """Job pengganti (ganti unit) dibatalkan → buat pengganti baru untuk job
        lama yang sama (proyek, rute, penawaran sama; unit bebas). Job pengganti
        yang dibatalkan dihapus (soft delete). BATASAN dijaga
        buat_ulang_job_pengganti (migration 20261001000029)."""
        lama = await self._job_untuk_ganti(job_id)
        # BATASAN: ETD pengganti tidak boleh lebih awal dari ETD job awal.
        if lama.get("etd") and parse_iso(payload.etd) < parse_iso(lama["etd"]):
            raise ValidationError(
                f"ETD job pengganti tidak boleh lebih awal dari ETD job awal {lama['job_number']}."
            )
        isian = JobCreate(
            alat_diangkut=lama["alat_diangkut"],
            asal=lama["asal"],
            tujuan=lama["tujuan"],
            asal_lat=num_or_none(lama.get("asal_lat")),
            asal_lng=num_or_none(lama.get("asal_lng")),
            tujuan_lat=num_or_none(lama.get("tujuan_lat")),
            tujuan_lng=num_or_none(lama.get("tujuan_lng")),
            unit_id=payload.unit_id,
            unit_trailer_id=payload.unit_trailer_id,
            driver_id=payload.driver_id,
            etd=payload.etd,
            eta=payload.eta,
            uang_jalan_awal=payload.uang_jalan_awal,
            catatan=payload.catatan if payload.catatan is not None else lama.get("catatan"),
            quotation_id=lama.get("quotation_id"),
            quotation_item_id=lama.get("quotation_item_id"),
            proyek_id=lama["proyek_id"],
        )
        data = await self.siapkan_baris(isian, created_by=created_by, kecuali_job_id=job_id)
        res = await self._db.rpc(
            "buat_ulang_job_pengganti",
            {"p_job_id": job_id, "p_job_baru": data, "p_alasan": payload.alasan},
        ).execute()
        baru = single(
            await self._db.table("jobs")
            .select("id, job_number, share_token")
            .eq("id", str(res.data))
            .maybe_single()
            .execute()
        )
        if baru is None:
            raise NotFoundError("Job pengganti tidak ditemukan")
        await self.kabari_driver(baru, isian)
        return JobCreated(id=baru["id"], job_number=baru["job_number"], share_token=baru["share_token"])

    async def _tolak_ganti_penugasan_bila_sudah_cair(self, job_id: str, fields: dict[str, Any]) -> None:
        """BATASAN: setelah ada uang jalan keluar (pencairan aktif), unit, unit
        trailer, dan driver job tidak bisa diubah lewat edit job — gunakan Ganti
        driver / Ganti unit trailer / Ganti unit (uang jalan supir lama dicatat)."""
        kolom = [k for k in ("unit_id", "unit_trailer_id", "driver_id") if k in fields]
        if not kolom:
            return
        res = await (
            self._db.table("jobs")
            .select("unit_id, unit_trailer_id, driver_id, uang_jalan(jenis)")
            .eq("id", job_id)
            .eq("uang_jalan.status", AKTIF)
            .eq("uang_jalan.jenis", "pencairan")
            .maybe_single()
            .execute()
        )
        job = single(res)
        if job is None or not (job.get("uang_jalan") or []):
            return
        berubah = [k for k in kolom if (fields[k] or None) != (job.get(k) or None)]
        if berubah:
            raise ValidationError(
                "Unit, unit trailer, dan driver tidak bisa diubah karena uang jalan sudah dicairkan. "
                "Gunakan Ganti driver / Ganti unit di detail job."
            )

    async def update_status(self, job_id: str, payload: UpdateStatusRequest) -> None:
        # Satu transaksi: catatan dititipkan lewat `app.status_note` dan dicatat
        # trigger riwayat bersama perubahan statusnya.
        tx = Transaksi(self._db)
        tx.setting("app.status_note", clean_text(payload.notes))
        tx.update("jobs", {"status_job": payload.status}, {"id": job_id})
        await tx.jalankan()

    async def cancel(self, job_id: str, payload: CancelRequest) -> None:
        res = await (
            self._db.table("jobs")
            .update({"status_job": "cancelled", "cancelled_reason": clean_text(payload.reason)})
            .eq("id", job_id)
            .execute()
        )
        reason = clean_text(payload.reason)
        for row in rows(res):
            await push_to_driver(
                row["driver_id"],
                title="Job dibatalkan",
                body=row["job_number"] + (f": {reason}" if reason else ""),
                data={"job_id": job_id, "kind": "job_dibatalkan"},
            )

    # ── Validasi admin (Fase 7) ─────────────────────────────────────────────

    async def validate(self, job_id: str) -> str:
        """Approve: menunggu_validasi → selesai; driver & unit dibebaskan (BR-01, BR-07)."""
        res = await self._db.rpc("admin_validate_job", {"p_job_id": job_id}).execute()
        job = await self.get(job_id)
        await push_to_driver(
            job.driver_id,
            title="Job divalidasi admin",
            body=f"{job.job_number} selesai. Anda kembali Stand By.",
            data={"job_id": job_id, "kind": "job_divalidasi"},
        )
        return str(res.data)

    async def return_to_driver(self, job_id: str, payload: ReturnJobRequest) -> str:
        res = await self._db.rpc(
            "admin_return_job",
            {"p_job_id": job_id, "p_note": payload.note.strip(), "p_to_status": payload.to_status},
        ).execute()
        job = await self.get(job_id)
        await push_to_driver(
            job.driver_id,
            title="Job dikembalikan admin",
            body=f"{job.job_number}: {payload.note.strip()}",
            data={"job_id": job_id, "kind": "job_dikembalikan"},
        )
        return str(res.data)


def _coords_changed(fields: dict[str, Any]) -> bool:
    return any(k in fields for k in ("asal_lat", "asal_lng", "tujuan_lat", "tujuan_lng"))

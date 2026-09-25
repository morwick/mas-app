"""Tagihan & piutang. Nomor: 0001/INV/MAS/I/2026, dimulai dari 0001 tiap tahun."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.core.soft_delete import AKTIF, DIHAPUS, STATUS
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.supabase import storage_public_url
from app.core.timeutil import iso_utc, roman_month, today_wib, today_wib_str
from app.core.transaksi import Transaksi

log = logging.getLogger(__name__)
from app.modules.invoices.schemas import (
    FinanceDashboardSummary,
    Invoice,
    InvoiceCreated,
    InvoiceInput,
    InvoiceItem,
    InvoiceItemInput,
    InvoiceListRow,
    InvoicePayment,
    InvoiceStatus,
    JobBelumDitagihRow,
    JobProfitabilityRow,
    PaymentInput,
    PiutangSummaryRow,
    SetInvoiceStatusRequest,
)

INVOICE_SELECT = """
  id, invoice_number, seq_no, seq_tahun,
  customer_id, customer_nama, customer_alamat, customer_npwp,
  pic_sapaan, pic_nama,
  quotation_id,
  kota_terbit, tanggal, termin_hari, jatuh_tempo,
  ppn_aktif, ppn_persen, subtotal, ppn_nominal, total, dibayar,
  status_tagihan, ttd_nama, ttd_jabatan,
  bank_nama, bank_rekening, bank_atas_nama,
  catatan, alasan_batal,
  sent_at, lunas_at, created_at, updated_at,
  faktur_pajak_path, faktur_pajak_uploaded_at,
  quotation:quotations(quote_number),
  created_by_profile:profiles!invoices_created_by_fkey(nama)
"""

ITEM_SELECT = """
  id, invoice_id, urutan, job_id, deskripsi, dari, tujuan,
  qty, satuan, harga_satuan, subtotal,
  job:jobs(job_number)
"""

PAYMENT_SELECT = """
  id, invoice_id, tanggal, jumlah, sumber_dana_id, metode,
  referensi, catatan, created_at,
  sumber:sumber_dana(nama),
  created_by_profile:profiles!invoice_payments_created_by_fkey(nama)
"""

# Lunas dikunci (angka tidak boleh berubah setelah uang masuk); batal dikunci
# (kalau perlu ditagih lagi, terbitkan nomor baru supaya arsip bisa ditelusuri).
EDITABLE_STATUSES: tuple[InvoiceStatus, ...] = ("draft", "terkirim")


def derive_tampil(stored: str, jatuh_tempo: str | None) -> tuple[str, int | None]:
    """Jatuh tempo diturunkan dari tanggal, bukan disimpan — tanpa cron, tepat waktu."""
    if stored != "terkirim" or not jatuh_tempo:
        return stored, None
    hari_ini = today_wib_str()
    jt = jatuh_tempo[:10]
    if jt >= hari_ini:
        return stored, None
    terlambat = (date.fromisoformat(hari_ini) - date.fromisoformat(jt)).days
    return "jatuh_tempo", terlambat


def _uang_jalan_ringkas(pagu: Any, transaksi: list[dict[str, Any]]) -> tuple[float, float]:
    """Pagu efektif (awal + penambahan) & total pencairan dari transaksi uang_jalan job."""
    pagu_awal = num(pagu)
    penambahan = sum(num(t.get("jumlah")) for t in transaksi if t.get("jenis") == "penambahan_pagu")
    cair = sum(num(t.get("jumlah")) for t in transaksi if t.get("jenis") == "pencairan")
    return pagu_awal + penambahan, cair


def _to_item(r: dict[str, Any], uj: dict[str, Any] | None) -> InvoiceItem:
    return InvoiceItem(
        id=r["id"],
        invoice_id=r["invoice_id"],
        urutan=r["urutan"],
        job_id=r.get("job_id"),
        job_number=(first(r.get("job")) or {}).get("job_number"),
        deskripsi=r["deskripsi"],
        dari=r.get("dari"),
        tujuan=r.get("tujuan"),
        qty=int(r["qty"]),
        satuan=r["satuan"],
        harga_satuan=num(r.get("harga_satuan")),
        subtotal=num(r.get("subtotal")),
        uang_jalan_pagu=(uj or {}).get("uang_jalan_pagu"),
        uang_jalan_cair=(uj or {}).get("uang_jalan_cair"),
        surat_jalan_urls=(uj or {}).get("surat_jalan_urls") or [],
    )


def _to_payment(r: dict[str, Any]) -> InvoicePayment:
    return InvoicePayment(
        id=r["id"],
        invoice_id=r["invoice_id"],
        tanggal=r["tanggal"],
        jumlah=num(r.get("jumlah")),
        sumber_dana_id=r.get("sumber_dana_id"),
        sumber_dana_nama=(first(r.get("sumber")) or {}).get("nama"),
        metode=r["metode"],
        referensi=r.get("referensi"),
        catatan=r.get("catatan"),
        created_by_nama=(first(r.get("created_by_profile")) or {}).get("nama"),
        created_at=r["created_at"],
    )


def _base_fields(r: dict[str, Any]) -> dict[str, Any]:
    total = num(r.get("total"))
    dibayar = num(r.get("dibayar"))
    status_tampil, hari_terlambat = derive_tampil(r["status_tagihan"], r.get("jatuh_tempo"))
    return {
        "id": r["id"],
        "invoice_number": r["invoice_number"],
        "seq_no": r["seq_no"],
        "seq_tahun": r["seq_tahun"],
        "customer_id": r["customer_id"],
        "customer_nama": r["customer_nama"],
        "customer_alamat": r.get("customer_alamat"),
        "customer_npwp": r.get("customer_npwp"),
        "pic_sapaan": r.get("pic_sapaan"),
        "pic_nama": r.get("pic_nama"),
        "quotation_id": r.get("quotation_id"),
        "quotation_number": (first(r.get("quotation")) or {}).get("quote_number"),
        "kota_terbit": r["kota_terbit"],
        "tanggal": r["tanggal"],
        "termin_hari": r.get("termin_hari"),
        "jatuh_tempo": r.get("jatuh_tempo"),
        "ppn_aktif": bool(r.get("ppn_aktif")),
        "ppn_persen": num(r.get("ppn_persen")),
        "subtotal": num(r.get("subtotal")),
        "ppn_nominal": num(r.get("ppn_nominal")),
        "total": total,
        "dibayar": dibayar,
        "sisa": total - dibayar,
        "status": r["status_tagihan"],
        "status_tampil": status_tampil,
        "hari_terlambat": hari_terlambat,
        "ttd_nama": r.get("ttd_nama"),
        "ttd_jabatan": r.get("ttd_jabatan"),
        "bank_nama": r.get("bank_nama"),
        "bank_rekening": r.get("bank_rekening"),
        "bank_atas_nama": r.get("bank_atas_nama"),
        "catatan": r.get("catatan"),
        "alasan_batal": r.get("alasan_batal"),
        "sent_at": r.get("sent_at"),
        "lunas_at": r.get("lunas_at"),
        "created_by_nama": (first(r.get("created_by_profile")) or {}).get("nama"),
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def _validate(payload: InvoiceInput) -> None:
    if not payload.tanggal:
        raise ValidationError("Tanggal tagihan wajib diisi")
    if not payload.kota_terbit.strip():
        raise ValidationError("Kota penerbitan wajib diisi")
    if not payload.items:
        raise ValidationError("Minimal satu baris rincian harus diisi")
    for i, it in enumerate(payload.items, start=1):
        if not it.deskripsi.strip():
            raise ValidationError(f"Baris {i}: uraian wajib diisi")
        if it.qty <= 0:
            raise ValidationError(f"Baris {i}: jumlah harus lebih dari 0")
        if it.harga_satuan < 0:
            raise ValidationError(f"Baris {i}: harga satuan tidak valid")
    if payload.ppn_aktif and not (0 <= payload.ppn_persen <= 100):
        raise ValidationError("Persentase PPN harus antara 0 dan 100")
    if payload.termin_hari is not None and payload.termin_hari < 0:
        raise ValidationError("Termin tidak boleh negatif")


def hitung_jatuh_tempo(tanggal: str, termin_hari: int | None, jatuh_tempo: str | None) -> str | None:
    """Jatuh tempo = tanggal + termin, kecuali admin mengisinya sendiri."""
    if jatuh_tempo:
        return jatuh_tempo
    if termin_hari is None:
        return None
    return (date.fromisoformat(tanggal[:10]) + timedelta(days=termin_hari)).isoformat()


def _item_rows(invoice_id: str, items: list[InvoiceItemInput]) -> list[dict[str, Any]]:
    return [
        {
            "invoice_id": invoice_id,
            "urutan": idx,
            "job_id": it.job_id or None,
            "deskripsi": it.deskripsi.strip(),
            "dari": clean_text(it.dari),
            "tujuan": clean_text(it.tujuan),
            "qty": int(it.qty),
            "satuan": it.satuan.strip() or "Unit",
            "harga_satuan": round(it.harga_satuan),
        }
        for idx, it in enumerate(items, start=1)
    ]


def _header_payload(payload: InvoiceInput, termin: int | None) -> dict[str, Any]:
    return {
        "quotation_id": payload.quotation_id or None,
        "kota_terbit": payload.kota_terbit.strip(),
        "tanggal": payload.tanggal,
        "termin_hari": termin,
        "jatuh_tempo": hitung_jatuh_tempo(payload.tanggal, termin, payload.jatuh_tempo),
        "ppn_aktif": payload.ppn_aktif,
        "ppn_persen": payload.ppn_persen,
        "ttd_nama": clean_text(payload.ttd_nama),
        "ttd_jabatan": clean_text(payload.ttd_jabatan) or "Admin",
        "bank_nama": clean_text(payload.bank_nama),
        "bank_rekening": clean_text(payload.bank_rekening),
        "bank_atas_nama": clean_text(payload.bank_atas_nama),
        "catatan": clean_text(payload.catatan),
    }


FAKTUR_PAJAK_SIGNED_URL_TTL_S = 60 * 60


class InvoiceService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._photos_bucket = get_settings().job_photos_bucket
        self._faktur_bucket = get_settings().faktur_pajak_bucket

    # ── Baca ────────────────────────────────────────────────────────────────

    async def list_all(
        self,
        *,
        status: InvoiceStatus | None = None,
        customer_id: str | None = None,
        limit: int | None = None,
    ) -> list[InvoiceListRow]:
        q = (
            self._db.table("invoices")
            .select(f"{INVOICE_SELECT}, invoice_items(id)")
            .eq("invoice_items.status", AKTIF)
            .order("seq_tahun", desc=True)
            .order("seq_no", desc=True)
        )
        if status:
            q = q.eq("status_tagihan", status)
        if customer_id:
            q = q.eq("customer_id", customer_id)
        if limit:
            q = q.limit(limit)
        return [
            InvoiceListRow(**_base_fields(r), jumlah_item=len(r.get("invoice_items") or []))
            for r in rows(await q.execute())
        ]

    async def _signed_faktur_url(self, path: str | None) -> str | None:
        if not path:
            return None
        try:
            res = await self._db.storage.from_(self._faktur_bucket).create_signed_url(
                path, FAKTUR_PAJAK_SIGNED_URL_TTL_S
            )
            return res.get("signedURL") or res.get("signedUrl")
        except Exception as exc:  # noqa: BLE001 — faktur yang tidak terbaca jangan gagalkan halaman
            log.warning("signed url faktur pajak gagal: %s", exc)
            return None

    async def get(self, invoice_id: str) -> Invoice:
        row = single(
            await self._db.table("invoices").select(INVOICE_SELECT).eq("id", invoice_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Tagihan tidak ditemukan")
        items_res, payments_res, faktur_url = await asyncio.gather(
            self._db.table("invoice_items").select(ITEM_SELECT).eq("invoice_id", invoice_id).order("urutan").execute(),
            self._db.table("invoice_payments")
            .select(PAYMENT_SELECT)
            .eq("invoice_id", invoice_id)
            .order("tanggal", desc=True)
            .order("created_at", desc=True)
            .execute(),
            self._signed_faktur_url(row.get("faktur_pajak_path")),
        )
        item_rows = rows(items_res)
        job_ids = [i["job_id"] for i in item_rows if i.get("job_id")]
        uj_by_job = await self._uang_jalan_surat_jalan(job_ids) if job_ids else {}
        return Invoice(
            **_base_fields(row),
            faktur_pajak_uploaded_at=row.get("faktur_pajak_uploaded_at"),
            faktur_pajak_url=faktur_url,
            items=[_to_item(i, uj_by_job.get(i.get("job_id"))) for i in item_rows],
            payments=[_to_payment(p) for p in rows(payments_res)],
        )

    async def _uang_jalan_surat_jalan(self, job_ids: list[str]) -> dict[str, dict[str, Any]]:
        """Ringkasan uang jalan & link surat jalan per job — untuk ditampilkan di rincian tagihan."""
        res = await (
            self._db.table("jobs")
            .select("id, uang_jalan_pagu, uang_jalan(jenis, jumlah), job_photos(file_path, slot)")
            .in_("id", job_ids)
            .eq("uang_jalan.status", AKTIF)
            .eq("job_photos.status", AKTIF)
            .eq("job_photos.slot", "surat_jalan")
            .execute()
        )
        out: dict[str, dict[str, Any]] = {}
        for r in rows(res):
            pagu, cair = _uang_jalan_ringkas(r.get("uang_jalan_pagu"), r.get("uang_jalan") or [])
            out[r["id"]] = {
                "uang_jalan_pagu": pagu,
                "uang_jalan_cair": cair,
                "surat_jalan_urls": [
                    storage_public_url(self._photos_bucket, p["file_path"]) for p in (r.get("job_photos") or [])
                ],
            }
        return out

    async def peek_next_number(self) -> str:
        today = today_wib()
        row = single(
            await self._db.table("invoices")
            .select("seq_no")
            .eq("seq_tahun", today.year)
            .order("seq_no", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        nxt = ((row or {}).get("seq_no") or 0) + 1
        return f"{nxt:04d}/INV/MAS/{roman_month(today.month)}/{today.year}"

    async def jobs_belum_ditagih(self, customer_id: str | None = None) -> dict[str, list[JobBelumDitagihRow]]:
        """Job selesai & sudah divalidasi admin yang belum masuk tagihan mana pun, dikelompokkan per customer.
        Tagihan yang dibatalkan tidak menghalangi job ditagih ulang."""
        sudah_res = await (
            self._db.table("invoice_items")
            .select("job_id, invoice:invoices(status_tagihan)")
            .not_.is_("job_id", "null")
            .execute()
        )
        sudah = {
            r["job_id"]
            for r in rows(sudah_res)
            if r.get("job_id") and (first(r.get("invoice")) or {}).get("status_tagihan") != "batal"
        }

        q = (
            self._db.table("jobs")
            .select(
                "id, customer_id, job_number, asal, tujuan, alat_diangkut, etd, completed_at,"
                " uang_jalan_pagu, uang_jalan(jenis, jumlah),"
                " job_photos(file_path, slot)"
            )
            # Hanya job yang sudah divalidasi admin yang bisa ditagihkan.
            .eq("status_job", "selesai")
            .not_.is_("validated_at", "null")
            .eq("uang_jalan.status", AKTIF)
            .eq("job_photos.status", AKTIF)
            .eq("job_photos.slot", "surat_jalan")
            .order("completed_at", desc=True)
        )
        if customer_id:
            q = q.eq("customer_id", customer_id)

        out: dict[str, list[JobBelumDitagihRow]] = {}
        for r in rows(await q.execute()):
            if r["id"] in sudah:
                continue
            cid = r.pop("customer_id")
            foto = r.pop("job_photos") or []
            pagu, cair = _uang_jalan_ringkas(r.pop("uang_jalan_pagu"), r.pop("uang_jalan") or [])
            out.setdefault(cid, []).append(
                JobBelumDitagihRow(
                    **r,
                    uang_jalan_pagu=pagu,
                    uang_jalan_cair=cair,
                    surat_jalan_urls=[storage_public_url(self._photos_bucket, p["file_path"]) for p in foto],
                )
            )
        return out

    async def piutang_summary(self) -> list[PiutangSummaryRow]:
        res = await self._db.rpc("get_piutang_summary").execute()
        return [
            PiutangSummaryRow(
                customer_id=str(r["customer_id"]),
                customer_nama=str(r.get("customer_nama") or "—"),
                jumlah_invoice=int(r.get("jumlah_invoice") or 0),
                total_tagihan=num(r.get("total_tagihan")),
                total_dibayar=num(r.get("total_dibayar")),
                sisa=num(r.get("sisa")),
                belum_jatuh_tempo=num(r.get("belum_jatuh_tempo")),
                umur_1_30=num(r.get("umur_1_30")),
                umur_31_60=num(r.get("umur_31_60")),
                umur_60_plus=num(r.get("umur_60_plus")),
            )
            for r in rows(res)
        ]

    async def finance_dashboard_summary(self) -> FinanceDashboardSummary:
        """Ringkasan buat dashboard finance — dihitung langsung dari kolom
        invoices/invoice_payments, reuse derive_tampil() supaya definisi
        "jatuh tempo" sama persis dengan yang tampil di menu Tagihan."""
        inv_res = await (
            self._db.table("invoices")
            .select("status_tagihan, total, dibayar, jatuh_tempo, faktur_pajak_path")
            .eq("status_tagihan", "terkirim")
            .execute()
        )
        belum_lunas_jumlah = 0
        belum_lunas_nominal = 0.0
        jatuh_tempo_jumlah = 0
        jatuh_tempo_nominal = 0.0
        belum_faktur_jumlah = 0
        for r in rows(inv_res):
            sisa = num(r.get("total")) - num(r.get("dibayar"))
            belum_lunas_jumlah += 1
            belum_lunas_nominal += sisa
            status_tampil, _ = derive_tampil(r["status_tagihan"], r.get("jatuh_tempo"))
            if status_tampil == "jatuh_tempo":
                jatuh_tempo_jumlah += 1
                jatuh_tempo_nominal += sisa
            if not r.get("faktur_pajak_path"):
                belum_faktur_jumlah += 1

        today = today_wib()
        mulai_bulan = today.replace(day=1)
        akhir_bulan = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)
        pay_res = await (
            self._db.table("invoice_payments")
            .select("jumlah")
            .gte("tanggal", mulai_bulan.isoformat())
            .lt("tanggal", akhir_bulan.isoformat())
            .execute()
        )
        pembayaran_bulan_ini = sum(num(p.get("jumlah")) for p in rows(pay_res))

        return FinanceDashboardSummary(
            tagihan_belum_lunas_jumlah=belum_lunas_jumlah,
            tagihan_belum_lunas_nominal=belum_lunas_nominal,
            tagihan_jatuh_tempo_jumlah=jatuh_tempo_jumlah,
            tagihan_jatuh_tempo_nominal=jatuh_tempo_nominal,
            invoice_belum_faktur_pajak_jumlah=belum_faktur_jumlah,
            pembayaran_bulan_ini_nominal=pembayaran_bulan_ini,
        )

    async def job_profitability(self, *, start: str | None, end: str | None) -> list[JobProfitabilityRow]:
        res = await self._db.rpc("get_job_profitability", {"p_start": start, "p_end": end}).execute()
        return [
            JobProfitabilityRow(
                job_id=str(r["job_id"]),
                job_number=str(r["job_number"]),
                customer_nama=str(r.get("customer_nama") or "—"),
                unit_kode=str(r.get("unit_kode") or "—"),
                etd=str(r["etd"]),
                status=r["status"],
                pendapatan=num(r.get("pendapatan")),
                uang_jalan=num(r.get("uang_jalan")),
                biaya_insiden=num(r.get("biaya_insiden")),
                laba=num(r.get("laba")),
            )
            for r in rows(res)
        ]

    # ── Tulis ───────────────────────────────────────────────────────────────

    async def create(self, payload: InvoiceInput, *, created_by: str | None) -> InvoiceCreated:
        _validate(payload)
        cust = single(
            await self._db.table("customers")
            .select("nama_perusahaan, alamat, npwp, pic_sapaan, pic_nama, termin_hari")
            .eq("id", payload.customer_id)
            .maybe_single()
            .execute()
        )
        if cust is None:
            raise NotFoundError("Customer tidak ditemukan")

        termin = payload.termin_hari if payload.termin_hari is not None else cust.get("termin_hari")

        # Satu transaksi: nomor, header, dan rincian tersimpan bersama — atau
        # tidak sama sekali (nomor pun ikut dibatalkan, jadi tidak loncat).
        tx = Transaksi(self._db)
        nomor = tx.nomor_dokumen("invoice")
        inv = tx.insert(
            "invoices",
            {
                "invoice_number": nomor["nomor"],
                "seq_no": nomor["seq"],
                "seq_tahun": nomor["tahun"],
                "customer_id": payload.customer_id,
                "customer_nama": cust["nama_perusahaan"],
                "customer_alamat": cust.get("alamat"),
                "customer_npwp": cust.get("npwp"),
                "pic_sapaan": payload.pic_sapaan or cust.get("pic_sapaan"),
                "pic_nama": clean_text(payload.pic_nama) or cust.get("pic_nama"),
                **_header_payload(payload, termin),
                "created_by": created_by,
            },
        )
        tx.insert("invoice_items", _item_rows(inv["id"], payload.items))
        hasil = await tx.jalankan()
        row = hasil[1][0]
        return InvoiceCreated(id=row["id"], invoice_number=row["invoice_number"])

    async def update(self, invoice_id: str, payload: InvoiceInput) -> None:
        _validate(payload)
        existing = single(
            await self._db.table("invoices")
            .select("status_tagihan, termin_hari")
            .eq("id", invoice_id)
            .maybe_single()
            .execute()
        )
        if existing is None:
            raise NotFoundError("Tagihan tidak ditemukan")
        if existing["status_tagihan"] not in EDITABLE_STATUSES:
            raise ValidationError(
                "Tagihan yang sudah lunas tidak bisa diubah. Hapus pembayarannya dulu bila memang perlu direvisi."
                if existing["status_tagihan"] == "lunas"
                else "Tagihan yang dibatalkan tidak bisa diubah. Terbitkan tagihan baru."
            )

        termin = payload.termin_hari if payload.termin_hari is not None else existing.get("termin_hari")
        # Satu transaksi: header, penghapusan rincian lama, dan rincian baru.
        # Kalau rincian baru gagal disimpan, rincian lama tidak ikut hilang.
        tx = Transaksi(self._db)
        tx.update(
            "invoices",
            {
                "pic_sapaan": payload.pic_sapaan,
                "pic_nama": clean_text(payload.pic_nama),
                **_header_payload(payload, termin),
            },
            {"id": invoice_id},
        )
        tx.hapus("invoice_items", {"invoice_id": invoice_id})
        tx.insert("invoice_items", _item_rows(invoice_id, payload.items))
        await tx.jalankan()

    async def set_status(self, invoice_id: str, payload: SetInvoiceStatusRequest) -> None:
        data: dict[str, Any] = {"status_tagihan": payload.status}
        if payload.status == "terkirim":
            data["sent_at"] = iso_utc()
        if payload.status == "batal":
            data["alasan_batal"] = clean_text(payload.alasan)
        if payload.status == "draft":
            data.update({"sent_at": None, "alasan_batal": None})
        await self._db.table("invoices").update(data).eq("id", invoice_id).execute()

    async def add_payment(self, invoice_id: str, payload: PaymentInput, *, created_by: str | None) -> None:
        if payload.jumlah <= 0:
            raise ValidationError("Jumlah pembayaran harus lebih dari 0")
        inv = single(
            await self._db.table("invoices").select("status_tagihan").eq("id", invoice_id).maybe_single().execute()
        )
        if inv is None:
            raise NotFoundError("Tagihan tidak ditemukan")
        if inv["status_tagihan"] == "draft":
            raise ValidationError("Tandai tagihan sebagai terkirim dulu sebelum mencatat pembayaran.")
        if inv["status_tagihan"] == "batal":
            raise ValidationError("Tagihan sudah dibatalkan.")
        await (
            self._db.table("invoice_payments")
            .insert(
                {
                    "invoice_id": invoice_id,
                    "tanggal": payload.tanggal,
                    "jumlah": round(payload.jumlah),
                    "sumber_dana_id": payload.sumber_dana_id or None,
                    "metode": clean_text(payload.metode) or "transfer",
                    "referensi": clean_text(payload.referensi),
                    "catatan": clean_text(payload.catatan),
                    "created_by": created_by,
                }
            )
            .execute()
        )

    async def delete_payment(self, payment_id: str) -> None:
        await self._db.table("invoice_payments").update({STATUS: DIHAPUS}).eq("id", payment_id).execute()

    async def upload_faktur_pajak(self, invoice_id: str, *, data: bytes, content_type: str | None) -> None:
        inv = single(
            await self._db.table("invoices")
            .select("status_tagihan, faktur_pajak_path")
            .eq("id", invoice_id)
            .maybe_single()
            .execute()
        )
        if inv is None:
            raise NotFoundError("Tagihan tidak ditemukan")
        if inv["status_tagihan"] in ("draft", "batal"):
            raise ValidationError("Tagihan harus berstatus terkirim dulu sebelum faktur pajak bisa diunggah.")

        ext = validate_document(content_type, len(data))
        path = f"{invoice_id}/{unique_object_name(ext)}"
        await upload_object(self._db, self._faktur_bucket, path, data, content_type or "application/pdf")
        try:
            await (
                self._db.table("invoices")
                .update({"faktur_pajak_path": path, "faktur_pajak_uploaded_at": iso_utc()})
                .eq("id", invoice_id)
                .execute()
            )
        except Exception:
            # Baris gagal diperbarui — jangan tinggalkan file yatim di bucket.
            await remove_object_quietly(self._db, self._faktur_bucket, path)
            raise

        # Ganti file: yang lama dibuang setelah baris baru berhasil tersimpan.
        lama = inv.get("faktur_pajak_path")
        if lama and lama != path:
            await remove_object_quietly(self._db, self._faktur_bucket, lama)

    async def delete(self, invoice_id: str) -> None:
        await self._db.table("invoices").update({STATUS: DIHAPUS}).eq("id", invoice_id).execute()

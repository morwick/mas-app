"""Surat penawaran. Nomor mengikuti arsip berjalan: 0018/SK/MAS/VIII/2026."""

from __future__ import annotations

from typing import Any

from supabase import AsyncClient

from app.core.errors import NotFoundError, ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.core.soft_delete import AKTIF, DIHAPUS, STATUS
from app.core.timeutil import iso_utc, roman_month, today_wib, today_wib_str
from app.core.transaksi import Transaksi
from app.modules.quotations.schemas import (
    Quotation,
    QuotationCreated,
    QuotationInput,
    QuotationItem,
    QuotationItemInput,
    QuotationJobRef,
    QuotationListRow,
    QuotationStatus,
    SetQuotationStatusRequest,
)

QUOTATION_SELECT = """
  id, quote_number, seq_no, seq_tahun,
  customer_id, customer_nama, customer_kota, pic_sapaan, pic_nama,
  kota_terbit, tanggal, berlaku_sampai, perihal, objek, lampiran,
  ppn_aktif, ppn_persen, subtotal, ppn_nominal, total,
  status_penawaran, ttd_nama, ttd_jabatan, catatan, alasan_ditolak,
  sent_at, decided_at, created_at, updated_at,
  created_by_profile:profiles!quotations_created_by_fkey(nama)
"""

ITEM_SELECT = """
  id, quotation_id, urutan, dari, tujuan, qty, satuan,
  nama_alat, harga_satuan, subtotal
"""

# Penawaran yang sudah `deal` dikunci: job (dan invoice) menggantungkan harga ke sana.
EDITABLE_STATUSES: tuple[QuotationStatus, ...] = ("draft", "terkirim", "ditolak", "kedaluwarsa")


def derive_status(stored: str, berlaku_sampai: str | None) -> QuotationStatus:
    """Kedaluwarsa diturunkan dari tanggal saat dibaca, bukan disimpan — tidak
    perlu cron, dan perpanjangan masa berlaku langsung mengaktifkan lagi."""
    if stored != "terkirim" or not berlaku_sampai:
        return stored  # type: ignore[return-value]
    return "kedaluwarsa" if berlaku_sampai[:10] < today_wib_str() else "terkirim"


def _to_item(r: dict[str, Any]) -> QuotationItem:
    return QuotationItem(
        id=r["id"],
        quotation_id=r["quotation_id"],
        urutan=r["urutan"],
        dari=r["dari"],
        tujuan=r["tujuan"],
        qty=int(r["qty"]),
        satuan=r["satuan"],
        nama_alat=r.get("nama_alat"),
        harga_satuan=num(r.get("harga_satuan")),
        subtotal=num(r.get("subtotal")),
    )


def _base_fields(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"],
        "quote_number": r["quote_number"],
        "seq_no": r["seq_no"],
        "seq_tahun": r["seq_tahun"],
        "customer_id": r["customer_id"],
        "customer_nama": r["customer_nama"],
        "customer_kota": r.get("customer_kota"),
        "pic_sapaan": r.get("pic_sapaan"),
        "pic_nama": r.get("pic_nama"),
        "kota_terbit": r["kota_terbit"],
        "tanggal": r["tanggal"],
        "berlaku_sampai": r.get("berlaku_sampai"),
        "perihal": r["perihal"],
        "objek": r.get("objek"),
        "lampiran": r.get("lampiran"),
        "ppn_aktif": bool(r.get("ppn_aktif")),
        "ppn_persen": num(r.get("ppn_persen")),
        "subtotal": num(r.get("subtotal")),
        "ppn_nominal": num(r.get("ppn_nominal")),
        "total": num(r.get("total")),
        "status": derive_status(r["status_penawaran"], r.get("berlaku_sampai")),
        "ttd_nama": r.get("ttd_nama"),
        "ttd_jabatan": r.get("ttd_jabatan"),
        "catatan": r.get("catatan"),
        "alasan_ditolak": r.get("alasan_ditolak"),
        "sent_at": r.get("sent_at"),
        "decided_at": r.get("decided_at"),
        "created_by_nama": (first(r.get("created_by_profile")) or {}).get("nama"),
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def _validate(payload: QuotationInput) -> None:
    if not payload.tanggal:
        raise ValidationError("Tanggal surat wajib diisi")
    if not payload.kota_terbit.strip():
        raise ValidationError("Kota penerbitan wajib diisi")
    if not payload.perihal.strip():
        raise ValidationError("Perihal wajib diisi")
    if not payload.items:
        raise ValidationError("Minimal satu baris rincian harus diisi")
    for i, it in enumerate(payload.items, start=1):
        if not it.dari.strip():
            raise ValidationError(f'Baris {i}: kolom "Dari" wajib diisi')
        if not it.tujuan.strip():
            raise ValidationError(f'Baris {i}: kolom "Tujuan" wajib diisi')
        if it.qty <= 0:
            raise ValidationError(f"Baris {i}: jumlah unit harus lebih dari 0")
        if it.harga_satuan < 0:
            raise ValidationError(f"Baris {i}: harga satuan tidak valid")
    if payload.ppn_aktif and not (0 <= payload.ppn_persen <= 100):
        raise ValidationError("Persentase PPN harus antara 0 dan 100")


def _item_rows(quotation_id: str, items: list[QuotationItemInput]) -> list[dict[str, Any]]:
    return [
        {
            "quotation_id": quotation_id,
            "urutan": idx,
            "dari": it.dari.strip(),
            "tujuan": it.tujuan.strip(),
            "qty": int(it.qty),
            "satuan": it.satuan.strip() or "Unit",
            "nama_alat": clean_text(it.nama_alat),
            "harga_satuan": round(it.harga_satuan),
        }
        for idx, it in enumerate(items, start=1)
    ]


def _header_payload(payload: QuotationInput) -> dict[str, Any]:
    return {
        "kota_terbit": payload.kota_terbit.strip(),
        "tanggal": payload.tanggal,
        "berlaku_sampai": payload.berlaku_sampai or None,
        "perihal": payload.perihal.strip(),
        "objek": clean_text(payload.objek),
        "lampiran": clean_text(payload.lampiran) or "-",
        "ppn_aktif": payload.ppn_aktif,
        "ppn_persen": payload.ppn_persen,
        "ttd_nama": clean_text(payload.ttd_nama),
        "ttd_jabatan": clean_text(payload.ttd_jabatan) or "Admin",
        "catatan": clean_text(payload.catatan),
    }


class QuotationService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def list_all(
        self,
        *,
        status: QuotationStatus | None = None,
        customer_id: str | None = None,
        limit: int | None = None,
    ) -> list[QuotationListRow]:
        # jobs ikut di-embed untuk kolom "Pelaksanaan"; RLS jobs menyaring per
        # jenis unit untuk operator, jadi hitungannya hanya job yang boleh ia lihat.
        q = (
            self._db.table("quotations")
            .select(f"{QUOTATION_SELECT}, quotation_items(id), jobs(id, status_job)")
            .eq("quotation_items.status", AKTIF)
            .eq("jobs.status", AKTIF)
            .order("seq_tahun", desc=True)
            .order("seq_no", desc=True)
        )
        if status:
            q = q.eq("status_penawaran", status)
        if customer_id:
            q = q.eq("customer_id", customer_id)
        if limit:
            q = q.limit(limit)

        out = []
        for r in rows(await q.execute()):
            jobs = [j for j in (r.get("jobs") or []) if j.get("status_job") != "cancelled"]
            out.append(
                QuotationListRow(
                    **_base_fields(r),
                    jumlah_item=len(r.get("quotation_items") or []),
                    jumlah_job=len(jobs),
                    jumlah_job_selesai=sum(1 for j in jobs if j.get("status_job") == "selesai"),
                )
            )
        return out

    async def get(self, quotation_id: str) -> Quotation:
        row = single(
            await self._db.table("quotations").select(QUOTATION_SELECT).eq("id", quotation_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Penawaran tidak ditemukan")
        items = rows(
            await self._db.table("quotation_items")
            .select(ITEM_SELECT)
            .eq("quotation_id", quotation_id)
            .order("urutan")
            .execute()
        )
        return Quotation(**_base_fields(row), items=[_to_item(i) for i in items])

    async def peek_next_number(self) -> str:
        """Pratinjau nomor berikutnya. Sengaja tidak memanggil next_quotation_number():
        fungsi itu menaikkan counter, jadi nomor akan terbakar tiap form dibuka."""
        today = today_wib()
        row = single(
            await self._db.table("quotations")
            .select("seq_no")
            .eq("seq_tahun", today.year)
            .order("seq_no", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        nxt = ((row or {}).get("seq_no") or 0) + 1
        return f"{nxt:04d}/SK/MAS/{roman_month(today.month)}/{today.year}"

    async def jobs_for(self, quotation_id: str) -> list[QuotationJobRef]:
        res = await (
            self._db.table("jobs")
            .select("id, job_number, status_job, asal, tujuan, etd")
            .eq("quotation_id", quotation_id)
            .order("created_at")
            .execute()
        )
        return [
            QuotationJobRef(
                id=r["id"],
                job_number=r["job_number"],
                status=r["status_job"],
                asal=r["asal"],
                tujuan=r["tujuan"],
                etd=r["etd"],
            )
            for r in rows(res)
        ]

    async def create(self, payload: QuotationInput, *, created_by: str | None) -> QuotationCreated:
        _validate(payload)

        cust = single(
            await self._db.table("customers")
            .select("nama_perusahaan, kota, pic_sapaan, pic_nama")
            .eq("id", payload.customer_id)
            .maybe_single()
            .execute()
        )
        if cust is None:
            raise NotFoundError("Customer tidak ditemukan")

        # Satu transaksi: nomor diambil atomik dari database (dua admin yang
        # menyimpan bersamaan tetap mendapat nomor berbeda), lalu header dan
        # rincian. Satu langkah gagal → semuanya batal, nomor tidak hangus.
        tx = Transaksi(self._db)
        nomor = tx.nomor_dokumen("quotation")
        q = tx.insert(
            "quotations",
            {
                "quote_number": nomor["nomor"],
                "seq_no": nomor["seq"],
                "seq_tahun": nomor["tahun"],
                "customer_id": payload.customer_id,
                "customer_nama": cust["nama_perusahaan"],
                "customer_kota": cust.get("kota"),
                "pic_sapaan": payload.pic_sapaan or cust.get("pic_sapaan"),
                "pic_nama": clean_text(payload.pic_nama) or cust.get("pic_nama"),
                **_header_payload(payload),
                "created_by": created_by,
            },
        )
        tx.insert("quotation_items", _item_rows(q["id"], payload.items))
        hasil = await tx.jalankan()
        row = hasil[1][0]
        return QuotationCreated(id=row["id"], quote_number=row["quote_number"])

    async def update(self, quotation_id: str, payload: QuotationInput) -> None:
        _validate(payload)
        existing = single(
            await self._db.table("quotations")
            .select("status_penawaran")
            .eq("id", quotation_id)
            .maybe_single()
            .execute()
        )
        if existing is None:
            raise NotFoundError("Penawaran tidak ditemukan")
        if existing["status_penawaran"] not in EDITABLE_STATUSES:
            raise ValidationError(
                "Penawaran yang sudah deal tidak bisa diubah. Batalkan status deal-nya dulu bila memang perlu direvisi."
            )

        # Rincian diganti utuh (baris bisa ditambah/dihapus/diurutkan bebas di
        # form) — dalam satu transaksi bersama header, supaya rincian lama tidak
        # hilang kalau rincian baru gagal disimpan.
        tx = Transaksi(self._db)
        tx.update(
            "quotations",
            {
                "pic_sapaan": payload.pic_sapaan,
                "pic_nama": clean_text(payload.pic_nama),
                **_header_payload(payload),
            },
            {"id": quotation_id},
        )
        tx.hapus("quotation_items", {"quotation_id": quotation_id})
        tx.insert("quotation_items", _item_rows(quotation_id, payload.items))
        await tx.jalankan()

    async def set_status(self, quotation_id: str, payload: SetQuotationStatusRequest) -> None:
        data: dict[str, Any] = {"status_penawaran": payload.status}
        now = iso_utc()
        if payload.status == "terkirim":
            data["sent_at"] = now
        if payload.status in ("deal", "ditolak"):
            data["decided_at"] = now
        if payload.status == "ditolak":
            data["alasan_ditolak"] = clean_text(payload.alasan)
        if payload.status == "draft":
            # Dibuka kembali → jejak keputusan sebelumnya dibersihkan.
            data.update({"sent_at": None, "decided_at": None, "alasan_ditolak": None})
        await self._db.table("quotations").update(data).eq("id", quotation_id).execute()

    async def delete(self, quotation_id: str) -> None:
        await self._db.table("quotations").update({STATUS: DIHAPUS}).eq("id", quotation_id).execute()

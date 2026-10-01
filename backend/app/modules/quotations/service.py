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
    RekomendasiHarga,
    SetQuotationStatusRequest,
    SimpanKeputusanRequest,
    SuratRevisiRequest,
)

QUOTATION_SELECT = """
  id, quote_number, seq_no, seq_tahun,
  customer_id, customer_nama, customer_kota, pic_sapaan, pic_nama,
  kota_terbit, tanggal, berlaku_sampai, perihal, objek, lampiran,
  ppn_aktif, ppn_persen, subtotal, ppn_nominal, total,
  status_penawaran, ttd_nama, ttd_jabatan, catatan, alasan_ditolak,
  sent_at, decided_at, created_at, updated_at, tanggal_revisi, berlaku_sampai_asli,
  berlaku_diatur_oleh, berlaku_diatur_at, revisi_dibuat_oleh, revisi_dibuat_at,
  created_by_profile:profiles!quotations_created_by_fkey(nama)
"""

ITEM_SELECT = """
  id, quotation_id, urutan, dari, tujuan, qty, satuan,
  nama_alat, harga_satuan, subtotal,
  dari_kecamatan_kode, tujuan_kecamatan_kode, jenis_unit_id,
  keputusan, harga_revisi, subtotal_final, alasan_ditolak, diputuskan_at, diputuskan_oleh
"""

# Hanya draft yang bisa diedit: job (dan invoice) menggantungkan harga ke item penawaran.
EDITABLE_STATUSES: tuple[QuotationStatus, ...] = ("draft",)


def derive_status(stored: str, berlaku_sampai: str | None) -> QuotationStatus:
    """Kedaluwarsa diturunkan dari tanggal saat dibaca, bukan disimpan — tidak
    perlu cron, dan perpanjangan masa berlaku langsung mengaktifkan lagi.
    Berlaku untuk draft maupun terkirim; completed (semua item sudah diputuskan)
    tidak pernah kedaluwarsa."""
    if stored not in ("draft", "terkirim") or not berlaku_sampai:
        return stored  # type: ignore[return-value]
    return "kedaluwarsa" if berlaku_sampai[:10] < today_wib_str() else stored  # type: ignore[return-value]


def status_dari_keputusan(keputusan: list[str]) -> QuotationStatus:
    """Masih ada item yang menunggu → terkirim; semua sudah diputuskan (deal
    maupun ditolak) → completed."""
    if not keputusan or "menunggu" in keputusan:
        return "terkirim"
    return "completed"


def _to_item(r: dict[str, Any], jumlah_job: int = 0, nama: dict[str, str] | None = None) -> QuotationItem:
    revisi = r.get("harga_revisi")
    harga_satuan = num(r.get("harga_satuan"))
    subtotal_final = r.get("subtotal_final")
    return QuotationItem(
        id=r["id"],
        quotation_id=r["quotation_id"],
        urutan=r["urutan"],
        dari=r["dari"],
        tujuan=r["tujuan"],
        qty=int(r["qty"]),
        satuan=r["satuan"],
        nama_alat=r.get("nama_alat"),
        dari_kecamatan_kode=r.get("dari_kecamatan_kode"),
        tujuan_kecamatan_kode=r.get("tujuan_kecamatan_kode"),
        jenis_unit_id=r.get("jenis_unit_id"),
        harga_satuan=harga_satuan,
        subtotal=num(r.get("subtotal")),
        keputusan=r.get("keputusan") or "menunggu",
        harga_revisi=None if revisi is None else num(revisi),
        harga_final=harga_satuan if revisi is None else num(revisi),
        subtotal_final=num(r.get("subtotal") if subtotal_final is None else subtotal_final),
        alasan_ditolak=r.get("alasan_ditolak"),
        diputuskan_at=r.get("diputuskan_at"),
        diputuskan_oleh=r.get("diputuskan_oleh"),
        diputuskan_oleh_nama=(nama or {}).get(r.get("diputuskan_oleh") or ""),
        jumlah_job=jumlah_job,
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
        "belum_dikirim": r["status_penawaran"] == "draft",
        "tanggal_revisi": r.get("tanggal_revisi"),
        "berlaku_sampai_asli": r.get("berlaku_sampai_asli"),
        "berlaku_diatur_oleh": r.get("berlaku_diatur_oleh"),
        "berlaku_diatur_at": r.get("berlaku_diatur_at"),
        "revisi_dibuat_oleh": r.get("revisi_dibuat_oleh"),
        "revisi_dibuat_at": r.get("revisi_dibuat_at"),
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
    if not payload.berlaku_sampai:
        raise ValidationError("Surat berlaku sampai wajib diisi")
    elif payload.berlaku_sampai <= payload.tanggal:
        raise ValidationError("Surat berlaku sampai harus setelah tanggal surat")
    if not payload.perihal.strip():
        raise ValidationError("Perihal wajib diisi")
    if not payload.items:
        raise ValidationError("Minimal satu baris rincian harus diisi")
    for i, it in enumerate(payload.items, start=1):
        if not it.dari.strip():
            raise ValidationError(f'Baris {i}: kolom "Dari" wajib diisi')
        if not it.tujuan.strip():
            raise ValidationError(f'Baris {i}: kolom "Tujuan" wajib diisi')
        if not (it.dari_kecamatan_kode or "").strip():
            raise ValidationError(f'Baris {i}: kecamatan "Dari" wajib dipilih')
        if not (it.tujuan_kecamatan_kode or "").strip():
            raise ValidationError(f'Baris {i}: kecamatan "Tujuan" wajib dipilih')
        if not (it.jenis_unit_id or "").strip():
            raise ValidationError(f"Baris {i}: jenis unit wajib dipilih")
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
            "dari_kecamatan_kode": (it.dari_kecamatan_kode or "").strip(),
            "tujuan_kecamatan_kode": (it.tujuan_kecamatan_kode or "").strip(),
            "jenis_unit_id": (it.jenis_unit_id or "").strip(),
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
            .select(
                f"{QUOTATION_SELECT}, quotation_items(id, keputusan, harga_revisi, subtotal, subtotal_final),"
                " jobs(id, status_job, quotation_item_id)"
            )
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
            punya_job = {j["quotation_item_id"] for j in jobs if j.get("quotation_item_id")}
            items = r.get("quotation_items") or []
            deal = [it for it in items if it.get("keputusan") == "deal"]
            menunggu = [it for it in items if it.get("keputusan") == "menunggu"]
            ditolak = [it for it in items if it.get("keputusan") == "ditolak"]
            out.append(
                QuotationListRow(
                    **_base_fields(r),
                    jumlah_item=len(items),
                    jumlah_item_deal_belum_job=sum(
                        1 for it in items if it.get("keputusan") == "deal" and it["id"] not in punya_job
                    ),
                    jumlah_item_deal=len(deal),
                    jumlah_item_deal_revisi=sum(1 for it in deal if it.get("harga_revisi") is not None),
                    nilai_deal=sum(
                        num(it.get("subtotal") if it.get("subtotal_final") is None else it["subtotal_final"])
                        for it in deal
                    ),
                    jumlah_item_menunggu=len(menunggu),
                    nilai_item_menunggu=sum(num(it.get("subtotal")) for it in menunggu),
                    jumlah_item_ditolak=len(ditolak),
                    nilai_item_ditolak=sum(num(it.get("subtotal")) for it in ditolak),
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
        # Job aktif per item — untuk tombol "Buat job" & hitungannya.
        per_item = await self._jumlah_job_per_item(quotation_id)
        nama = await self._nama_karyawan(
            [row.get("berlaku_diatur_oleh"), row.get("revisi_dibuat_oleh"), *(i.get("diputuskan_oleh") for i in items)]
        )
        hasil = [_to_item(i, per_item.get(i["id"], 0), nama) for i in items]
        return Quotation(
            **_base_fields(row),
            berlaku_diatur_oleh_nama=nama.get(row.get("berlaku_diatur_oleh") or ""),
            revisi_dibuat_oleh_nama=nama.get(row.get("revisi_dibuat_oleh") or ""),
            items=hasil,
            nilai_deal=sum(i.subtotal_final for i in hasil if i.keputusan == "deal"),
        )

    async def _jumlah_job_per_item(self, quotation_id: str) -> dict[str, int]:
        """quotation_item_id → jumlah job aktif (yang tidak dibatalkan)."""
        job_rows = rows(
            await self._db.table("jobs")
            .select("quotation_item_id, status_job")
            .eq("quotation_id", quotation_id)
            .neq("status_job", "cancelled")
            .execute()
        )
        per_item: dict[str, int] = {}
        for j in job_rows:
            if j.get("quotation_item_id"):
                per_item[j["quotation_item_id"]] = per_item.get(j["quotation_item_id"], 0) + 1
        return per_item

    async def _nama_karyawan(self, ids: list[str | None]) -> dict[str, str]:
        """Nama karyawan pelaku (hr.karyawan ada di schema lain → lewat fungsi DB)."""
        unik = sorted({i for i in ids if i})
        if not unik:
            return {}
        res = await self._db.rpc("nama_karyawan", {"p_ids": unik}).execute()
        return {r["id"]: r["nama"] for r in rows(res)}

    async def rekomendasi_harga(
        self,
        *,
        dari_kecamatan_kode: str,
        tujuan_kecamatan_kode: str,
        jenis_unit_id: str,
        customer_id: str | None = None,
        kecuali_quotation_id: str | None = None,
    ) -> list[RekomendasiHarga]:
        """Harga terakhir rute + jenis unit yang sama: {customer ini, semua} ×
        {deal, menunggu}. Penawaran yang sedang diedit dikecualikan."""
        res = await self._db.rpc(
            "rekomendasi_harga_penawaran",
            {
                "p_dari_kecamatan_kode": dari_kecamatan_kode,
                "p_tujuan_kecamatan_kode": tujuan_kecamatan_kode,
                "p_jenis_unit_id": jenis_unit_id,
                "p_customer_id": customer_id or None,
                "p_kecuali_quotation_id": kecuali_quotation_id or None,
            },
        ).execute()
        hari_ini = today_wib_str()
        out = []
        for r in rows(res):
            berlaku = r.get("berlaku_sampai")
            revisi = r.get("harga_revisi")
            out.append(
                RekomendasiHarga(
                    lingkup=r["lingkup"],
                    kategori=r["kategori"],
                    quotation_id=r["quotation_id"],
                    quote_number=r["quote_number"],
                    customer_nama=r["customer_nama"],
                    tanggal=r["tanggal"],
                    berlaku_sampai=berlaku,
                    kedaluwarsa=r["kategori"] == "menunggu" and bool(berlaku) and str(berlaku)[:10] < hari_ini,
                    diputuskan_at=r.get("diputuskan_at"),
                    harga=num(r.get("harga")),
                    harga_satuan=num(r.get("harga_satuan")),
                    harga_revisi=None if revisi is None else num(revisi),
                    nama_alat=r.get("nama_alat"),
                    qty=int(r.get("qty") or 1),
                    satuan=r.get("satuan") or "Unit",
                )
            )
        return out

    async def catat_cetak(self, quotation_id: str, versi: str) -> None:
        """Setiap cetak surat penawaran tercatat di log sistem (karyawan, waktu, IP)."""
        await self._db.rpc("catat_cetak_penawaran", {"p_quotation_id": quotation_id, "p_versi": versi}).execute()

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
            .select("id, job_number, status_job, asal, tujuan, etd, quotation_item_id")
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
                quotation_item_id=r.get("quotation_item_id"),
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
                "Penawaran yang sudah terkirim tidak bisa diubah. "
                "Hanya penawaran berstatus draft yang bisa diedit — buka kembali dulu bila statusnya sudah ditolak."
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

    async def simpan_keputusan(self, quotation_id: str, payload: SimpanKeputusanRequest) -> QuotationStatus:
        """Keputusan deal / tolak (+ revisi harga) per item, dalam satu transaksi
        bersama status penawaran yang dihitung ulang dari semua item."""
        q = single(
            await self._db.table("quotations")
            .select("status_penawaran")
            .eq("id", quotation_id)
            .maybe_single()
            .execute()
        )
        if q is None:
            raise NotFoundError("Penawaran tidak ditemukan")
        if q["status_penawaran"] not in ("terkirim", "completed"):
            raise ValidationError("Keputusan item hanya bisa diisi setelah penawaran ditandai terkirim.")
        items = {
            r["id"]: r
            for r in rows(
                await self._db.table("quotation_items")
                .select("id, urutan, keputusan, harga_revisi, alasan_ditolak")
                .eq("quotation_id", quotation_id)
                .execute()
            )
        }
        # BATASAN: item deal yang sudah dibuatkan job (tidak dibatalkan) terkunci —
        # keputusannya tidak boleh kembali ke menunggu / ditolak dan harga
        # revisinya tidak boleh diubah, karena job & tagihannya memakai harga itu.
        # Database menjaga hal yang sama (trigger quotation_item_cek_keputusan);
        # pemeriksaan di sini memberi pesan yang menyebut barisnya.
        punya_job = await self._jumlah_job_per_item(quotation_id)
        now = iso_utc()
        tx = Transaksi(self._db)
        akhir = {i: r["keputusan"] for i, r in items.items()}
        dilihat: set[str] = set()
        for k in payload.items:
            lama = items.get(k.item_id)
            if lama is None:
                raise ValidationError("Item penawaran tidak ditemukan di penawaran ini.")
            if k.item_id in dilihat:
                raise ValidationError(f"Item baris {lama['urutan']} dikirim lebih dari sekali.")
            dilihat.add(k.item_id)
            if k.harga_revisi is not None and k.harga_revisi < 0:
                raise ValidationError(f"Baris {lama['urutan']}: harga revisi tidak valid.")
            data: dict[str, Any] = {
                "keputusan": k.keputusan,
                "harga_revisi": k.harga_revisi if k.keputusan == "deal" else None,
                "alasan_ditolak": clean_text(k.alasan) if k.keputusan == "ditolak" else None,
            }
            akhir[k.item_id] = k.keputusan
            if all(lama.get(f) == v for f, v in data.items()):
                continue  # tidak berubah — jangan sentuh
            berubah_kunci = (lama.get("keputusan"), lama.get("harga_revisi")) != (k.keputusan, data["harga_revisi"])
            if punya_job.get(k.item_id) and berubah_kunci:
                raise ValidationError(
                    f"Baris {lama['urutan']} sudah dibuatkan job — keputusan dan harganya tidak bisa diubah."
                )
            data["diputuskan_at"] = None if k.keputusan == "menunggu" else now
            tx.update("quotation_items", data, {"id": k.item_id, "quotation_id": quotation_id})

        status = status_dari_keputusan(list(akhir.values()))
        header: dict[str, Any] = {"status_penawaran": status}
        # Alasan ditolak kini per item; kolom header lama dikosongkan.
        header["alasan_ditolak"] = None
        header["decided_at"] = None if status == "terkirim" else now
        tx.update("quotations", header, {"id": quotation_id})
        await tx.jalankan()
        return status

    async def simpan_surat_revisi(self, quotation_id: str, payload: SuratRevisiRequest) -> None:
        """Simpan tanggal surat versi revisi & masa berlakunya (dipanggil saat
        dicetak). Masa berlaku surat asli disimpan sekali di berlaku_sampai_asli;
        berlaku_sampai lalu mengikuti surat revisi, sehingga status kedaluwarsa
        dan pengingat ikut surat revisi. Satu UPDATE = satu transaksi; tercatat
        di log sistem lewat trigger."""
        q = single(
            await self._db.table("quotations")
            .select("status_penawaran, berlaku_sampai, berlaku_sampai_asli")
            .eq("id", quotation_id)
            .maybe_single()
            .execute()
        )
        if q is None:
            raise NotFoundError("Penawaran tidak ditemukan")
        if q["status_penawaran"] not in ("terkirim", "completed"):
            raise ValidationError("Surat revisi hanya untuk penawaran yang sudah terkirim atau completed.")
        revisi = rows(
            await self._db.table("quotation_items")
            .select("id")
            .eq("quotation_id", quotation_id)
            .not_.is_("harga_revisi", "null")
            .limit(1)
            .execute()
        )
        if not revisi:
            raise ValidationError("Belum ada harga item yang direvisi — surat revisi belum bisa dibuat.")
        tx = Transaksi(self._db)
        tx.update(
            "quotations",
            {
                "tanggal_revisi": payload.tanggal.isoformat(),
                "berlaku_sampai": payload.berlaku_sampai.isoformat(),
                "berlaku_sampai_asli": q.get("berlaku_sampai_asli") or q["berlaku_sampai"],
            },
            {"id": quotation_id},
        )
        await tx.jalankan()

    async def set_status(self, quotation_id: str, payload: SetQuotationStatusRequest) -> None:
        if payload.status == "completed":
            raise ValidationError("Completed otomatis setelah semua item diputuskan — isi lewat keputusan item.")
        if payload.status == "kedaluwarsa":
            raise ValidationError("Status kedaluwarsa dihitung otomatis dari tanggal berlaku.")
        if payload.status == "terkirim":
            q = single(
                await self._db.table("quotations")
                .select("berlaku_sampai")
                .eq("id", quotation_id)
                .maybe_single()
                .execute()
            )
            if q and q.get("berlaku_sampai") and str(q["berlaku_sampai"])[:10] < today_wib_str():
                raise ValidationError(
                    "Masa berlaku penawaran ini sudah lewat. "
                    "Ubah tanggal Berlaku sampai dulu sebelum menandai terkirim."
                )
        data: dict[str, Any] = {"status_penawaran": payload.status}
        now = iso_utc()
        if payload.status == "terkirim":
            data["sent_at"] = now
        if payload.status == "draft":
            # Dibuka kembali → jejak keputusan sebelumnya (termasuk per item)
            # dibersihkan, dalam satu transaksi.
            data.update({"sent_at": None, "decided_at": None, "alasan_ditolak": None, "tanggal_revisi": None})
            # Harga revisi per item ikut direset → surat revisi tidak berlaku lagi;
            # masa berlaku kembali ke surat asli.
            asli = single(
                await self._db.table("quotations")
                .select("berlaku_sampai_asli")
                .eq("id", quotation_id)
                .maybe_single()
                .execute()
            )
            if asli and asli.get("berlaku_sampai_asli"):
                data.update({"berlaku_sampai": asli["berlaku_sampai_asli"], "berlaku_sampai_asli": None})
            tx = Transaksi(self._db)
            tx.update("quotations", data, {"id": quotation_id})
            tx.update(
                "quotation_items",
                {"keputusan": "menunggu", "harga_revisi": None, "alasan_ditolak": None, "diputuskan_at": None},
                {"quotation_id": quotation_id},
                wajib=False,
            )
            await tx.jalankan()
            return
        await self._db.table("quotations").update(data).eq("id", quotation_id).execute()

    async def delete(self, quotation_id: str) -> None:
        existing = single(
            await self._db.table("quotations")
            .select("status_penawaran")
            .eq("id", quotation_id)
            .maybe_single()
            .execute()
        )
        if existing is not None and existing["status_penawaran"] not in EDITABLE_STATUSES:
            raise ValidationError(
                "Penawaran yang sudah terkirim tidak bisa dihapus. Hanya penawaran berstatus draft yang bisa dihapus."
            )
        await self._db.table("quotations").update({STATUS: DIHAPUS}).eq("id", quotation_id).execute()

"""Perintah Kerja Perbaikan (work order).

* Simpan = satu `Transaksi`: induk + mekanik + jasa + sparepart + biaya lain +
  klaim asuransi sekaligus. Total biaya dihitung di sini dan ikut disimpan.
* Nomor otomatis, validasi polis / insiden / aset, dan sinkron status aset &
  insiden dikerjakan trigger database (migration 20260930000003).
* Perubahan status lewat `ubah_status()`; WO yang sudah berjalan tidak bisa
  dihapus (batalkan saja) — dijaga database.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.config import get_settings
from app.core.dokumen import signed_url_dokumen
from app.core.errors import NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, escape_like
from app.core.pg import num, num_or_none, rows, single
from app.core.sinkron_anak import sinkron_anak
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.transaksi import Transaksi
from app.modules.asuransi.polis import PolisService
from app.modules.asuransi.service import to_pic
from app.modules.perintah_kerja.schemas import (
    STATUS_FINAL,
    BiayaLainItem,
    FotoWo,
    JasaItem,
    JenisAset,
    Klaim,
    MekanikBertugas,
    PerintahKerja,
    PerintahKerjaInput,
    PerintahKerjaRingkas,
    SparepartItem,
    UbahStatusInput,
)
from app.modules.perintah_kerja.tanggungan import hitung_tanggungan

# Hint relasi eksplisit: klaim_asuransi punya FK ke perintah_kerja & polis,
# jadi PostgREST bisa menganggapnya tabel penghubung.
_SELECT = (
    "*, unit:units!perintah_kerja_unit_id_fkey(kode_unit),"
    " trailer:unit_trailer!perintah_kerja_unit_trailer_id_fkey(kode_trailer),"
    " bengkel:bengkel!perintah_kerja_bengkel_id_fkey(nama),"
    " rekanan:asuransi_bengkel_rekanan!perintah_kerja_bengkel_rekanan_id_fkey(nama),"
    " polis:polis_asuransi!perintah_kerja_polis_id_fkey(nomor_polis, asuransi:asuransi(nama)),"
    " klaim:klaim_asuransi!klaim_asuransi_perintah_kerja_id_fkey(*)"
)


def _klaim_aktif(data: Any) -> dict[str, Any] | None:
    daftar = data if isinstance(data, list) else ([data] if data else [])
    return next((k for k in daftar if k.get("status", 1) == 1), None)


class PerintahKerjaService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().dokumen_master_bucket

    # ── Bantu ───────────────────────────────────────────────────────────────

    async def _nama_mekanik(self) -> dict[str, str]:
        res = await self._db.rpc(
            "daftar_mekanik", {"p_q": None, "p_aktif": None, "p_limit": None, "p_offset": 0}
        ).execute()
        return {str(r["id"]): r["nama"] for r in rows(res)}

    async def _pj_per_wo(self, wo_ids: list[str]) -> dict[str, str]:
        if not wo_ids:
            return {}
        res = await (
            self._db.table("perintah_kerja_mekanik")
            .select("perintah_kerja_id, mekanik_id")
            .in_("perintah_kerja_id", wo_ids)
            .eq("is_penanggung_jawab", True)
            .execute()
        )
        data = rows(res)
        if not data:
            return {}
        nama = await self._nama_mekanik()
        return {r["perintah_kerja_id"]: nama.get(r["mekanik_id"], "Mekanik") for r in data}

    @staticmethod
    def _ringkas(r: dict[str, Any], pj: str | None = None) -> dict[str, Any]:
        klaim = _klaim_aktif(r.get("klaim"))
        jenis_aset: JenisAset = "unit" if r.get("unit_id") else "unit_trailer"
        polis = r.get("polis") or {}
        if r["pelaksana"] == "bengkel":
            pelaksana_nama = (r.get("bengkel") or {}).get("nama")
        elif r["pelaksana"] == "asuransi":
            pelaksana_nama = (polis.get("asuransi") or {}).get("nama")
        else:
            pelaksana_nama = pj or "Mekanik internal"
        total = num(r.get("total_biaya"))
        return {
            "id": r["id"],
            "nomor": r.get("nomor") or "",
            "tanggal": r["tanggal"],
            "jenis_aset": jenis_aset,
            "aset_id": r.get("unit_id") or r.get("unit_trailer_id"),
            "kode_aset": (r.get("unit") or {}).get("kode_unit") or (r.get("trailer") or {}).get("kode_trailer") or "—",
            "jenis": r["jenis"],
            "sumber": r["sumber"],
            "prioritas": r["prioritas"],
            "keluhan": r.get("keluhan"),
            "pelaksana": r["pelaksana"],
            "pelaksana_nama": pelaksana_nama,
            "status_wo": r["status_wo"],
            "jadwal_mulai": r.get("jadwal_mulai"),
            "estimasi_selesai": r.get("estimasi_selesai"),
            "tanggal_selesai": r.get("tanggal_selesai"),
            "odometer_km": num_or_none(r.get("odometer_km")),
            "total_biaya": total,
            "tanggungan": hitung_tanggungan(
                total,
                pelaksana=r["pelaksana"],
                status_klaim=(klaim or {}).get("status_klaim"),
                nilai_diajukan=num_or_none((klaim or {}).get("nilai_diajukan")),
                nilai_disetujui=num_or_none((klaim or {}).get("nilai_disetujui")),
                own_risk=num_or_none((klaim or {}).get("own_risk")),
            ),
            "incident_id": r.get("incident_id"),
            "status_klaim": (klaim or {}).get("status_klaim"),
        }

    async def _ids_aset_kode(self, q: str) -> tuple[list[str], list[str]]:
        pola = f"%{escape_like(q.strip())}%"
        u = await self._db.table("units").select("id").ilike("kode_unit", pola).execute()
        t = await self._db.table("unit_trailer").select("id").ilike("kode_trailer", pola).execute()
        return [r["id"] for r in rows(u)], [r["id"] for r in rows(t)]

    # ── Baca ────────────────────────────────────────────────────────────────

    async def list_page(
        self,
        *,
        params: PageParams,
        q: str | None = None,
        status_wo: str | None = None,
        pelaksana: str | None = None,
        jenis: str | None = None,
        dari: date | None = None,
        sampai: date | None = None,
        unit_id: str | None = None,
        unit_trailer_id: str | None = None,
        incident_id: str | None = None,
        asuransi_id: str | None = None,
    ) -> Page[PerintahKerjaRingkas]:
        query = self._db.table("perintah_kerja").select(_SELECT, count=CountMethod.exact).eq("klaim.status", 1)
        if status_wo == "aktif":
            query = query.in_("status_wo", ["dikerjakan", "menunggu_sparepart", "menunggu_asuransi"])
        elif status_wo == "terbuka":
            query = query.not_.in_("status_wo", list(STATUS_FINAL))
        elif status_wo:
            query = query.eq("status_wo", status_wo)
        if pelaksana:
            query = query.eq("pelaksana", pelaksana)
        if jenis:
            query = query.eq("jenis", jenis)
        if dari:
            query = query.gte("tanggal", dari.isoformat())
        if sampai:
            query = query.lte("tanggal", sampai.isoformat())
        if unit_id:
            query = query.eq("unit_id", unit_id)
        if unit_trailer_id:
            query = query.eq("unit_trailer_id", unit_trailer_id)
        if incident_id:
            query = query.eq("incident_id", incident_id)
        if asuransi_id:
            polis = await self._db.table("polis_asuransi").select("id").eq("asuransi_id", asuransi_id).execute()
            ids = [r["id"] for r in rows(polis)]
            if not ids:
                return build_page([], 0, params)
            query = query.in_("polis_id", ids)
        if q and q.strip():
            pola = f"*{escape_like(q.strip())}*"
            syarat = [f"nomor.ilike.{pola}", f"keluhan.ilike.{pola}"]
            unit_ids, trailer_ids = await self._ids_aset_kode(q)
            if unit_ids:
                syarat.append(f"unit_id.in.({','.join(unit_ids)})")
            if trailer_ids:
                syarat.append(f"unit_trailer_id.in.({','.join(trailer_ids)})")
            query = query.or_(",".join(syarat))
        res = await apply_window(query.order("tanggal", desc=True).order("created_at", desc=True), params).execute()
        data = rows(res)
        pj = await self._pj_per_wo([r["id"] for r in data if r["pelaksana"] == "internal"])
        return build_page([PerintahKerjaRingkas(**self._ringkas(r, pj.get(r["id"]))) for r in data], res.count, params)

    async def get(self, wo_id: str) -> PerintahKerja:
        row = single(
            await self._db.table("perintah_kerja").select(_SELECT).eq("klaim.status", 1).eq("id", wo_id)
            .maybe_single().execute()
        )  # fmt: skip
        if row is None:
            raise NotFoundError("Perintah kerja tidak ditemukan")

        async def anak(tabel: str) -> list[dict[str, Any]]:
            res = await self._db.table(tabel).select("*").eq("perintah_kerja_id", wo_id).order("created_at").execute()
            return rows(res)

        mekanik_rows = await anak("perintah_kerja_mekanik")
        jasa_rows = sorted(await anak("perintah_kerja_jasa"), key=lambda r: r.get("urutan") or 0)
        part_rows = sorted(await anak("perintah_kerja_sparepart"), key=lambda r: r.get("urutan") or 0)
        lain_rows = sorted(await anak("perintah_kerja_biaya_lain"), key=lambda r: r.get("urutan") or 0)
        foto_rows = await anak("perintah_kerja_foto")
        nama = await self._nama_mekanik() if (mekanik_rows or any(j.get("mekanik_id") for j in jasa_rows)) else {}

        mekanik = sorted(
            [
                MekanikBertugas(
                    id=m["id"],
                    mekanik_id=m["mekanik_id"],
                    nama=nama.get(m["mekanik_id"], "Mekanik"),
                    is_penanggung_jawab=bool(m.get("is_penanggung_jawab")),
                )
                for m in mekanik_rows
            ],
            key=lambda m: (not m.is_penanggung_jawab, m.nama),
        )
        pj = next((m.nama for m in mekanik if m.is_penanggung_jawab), None)
        dasar = self._ringkas(row, pj)

        klaim_row = _klaim_aktif(row.get("klaim"))
        klaim: Klaim | None = None
        if klaim_row:
            pic = None
            if klaim_row.get("pic_id"):
                pic_row = single(
                    await self._db.table("asuransi_pic")
                    .select("*")
                    .eq("id", klaim_row["pic_id"])
                    .maybe_single()
                    .execute()
                )
                pic = to_pic(pic_row) if pic_row else None
            klaim = Klaim(
                id=klaim_row["id"],
                nomor_klaim=klaim_row.get("nomor_klaim"),
                tanggal_pengajuan=klaim_row.get("tanggal_pengajuan"),
                status_klaim=klaim_row["status_klaim"],
                nilai_diajukan=num_or_none(klaim_row.get("nilai_diajukan")),
                nilai_disetujui=num_or_none(klaim_row.get("nilai_disetujui")),
                own_risk=num_or_none(klaim_row.get("own_risk")),
                catatan=klaim_row.get("catatan"),
                pic=pic,
            )

        polis = await PolisService(self._db).get(row["polis_id"]) if row.get("polis_id") else None
        return PerintahKerja(
            **dasar,
            diagnosa=row.get("diagnosa"),
            catatan=row.get("catatan"),
            alasan_batal=row.get("alasan_batal"),
            no_nota=row.get("no_nota"),
            bengkel_id=row.get("bengkel_id"),
            polis=polis,
            bengkel_rekanan_id=row.get("bengkel_rekanan_id"),
            bengkel_rekanan_nama=(row.get("rekanan") or {}).get("nama"),
            mekanik=mekanik,
            jasa=[
                JasaItem(
                    id=j["id"],
                    uraian=j["uraian"],
                    mekanik_id=j.get("mekanik_id"),
                    mekanik_nama=nama.get(j["mekanik_id"]) if j.get("mekanik_id") else None,
                    jam_kerja=num_or_none(j.get("jam_kerja")),
                    biaya=num(j.get("biaya")),
                )
                for j in jasa_rows
            ],
            sparepart=[
                SparepartItem(
                    id=p["id"],
                    kode=p.get("kode"),
                    nama=p["nama"],
                    qty=num(p.get("qty")),
                    satuan=p.get("satuan"),
                    harga_satuan=num(p.get("harga_satuan")),
                    subtotal=round(num(p.get("qty")) * num(p.get("harga_satuan")), 2),
                    keterangan=p.get("keterangan"),
                )
                for p in part_rows
            ],
            biaya_lain=[BiayaLainItem(id=b["id"], uraian=b["uraian"], biaya=num(b.get("biaya"))) for b in lain_rows],
            foto=[
                FotoWo(
                    id=f["id"],
                    jenis=f["jenis"],
                    nama_file=f.get("nama_file"),
                    content_type=f.get("content_type"),
                    url=await signed_url_dokumen(self._db, f.get("file_path")),
                    created_at=f["created_at"],
                )
                for f in foto_rows
            ],
            klaim=klaim,
            total_jasa=num(row.get("total_jasa")),
            total_sparepart=num(row.get("total_sparepart")),
            total_lain=num(row.get("total_lain")),
            created_at=row["created_at"],
        )

    # ── Tulis ───────────────────────────────────────────────────────────────

    @staticmethod
    def _total(payload: PerintahKerjaInput) -> dict[str, float]:
        jasa = round(sum(j.biaya for j in payload.jasa), 2)
        part = round(sum(p.qty * p.harga_satuan for p in payload.sparepart), 2)
        lain = round(sum(b.biaya for b in payload.biaya_lain), 2)
        return {
            "total_jasa": jasa,
            "total_sparepart": part,
            "total_lain": lain,
            "total_biaya": round(jasa + part + lain, 2),
        }

    async def _cek_polis(self, payload: PerintahKerjaInput) -> float | None:
        """Pelaksana asuransi: polis harus milik aset & berlaku pada tanggal WO.
        Mengembalikan own risk polis (dipakai bila klaim belum mengisinya)."""
        if payload.pelaksana != "asuransi":
            return None
        polis = await PolisService(self._db).get(payload.polis_id or "")
        if polis.unit_id != payload.unit_id or polis.unit_trailer_id != payload.unit_trailer_id:
            raise ValidationError("Polis asuransi bukan milik aset ini.")
        if not (date.fromisoformat(polis.mulai) <= payload.tanggal <= date.fromisoformat(polis.berakhir)):
            raise ValidationError(
                f"Polis {polis.nomor_polis} tidak berlaku pada tanggal perintah kerja "
                f"(berlaku {polis.mulai} s/d {polis.berakhir})."
            )
        return polis.own_risk

    @staticmethod
    def _header(payload: PerintahKerjaInput) -> dict[str, Any]:
        asuransi = payload.pelaksana == "asuransi"
        return {
            "tanggal": payload.tanggal.isoformat(),
            "incident_id": payload.incident_id or None,
            "sumber": payload.sumber,
            "jenis": payload.jenis,
            "prioritas": payload.prioritas,
            "keluhan": payload.keluhan,
            "diagnosa": payload.diagnosa,
            "catatan": payload.catatan,
            "pelaksana": payload.pelaksana,
            "bengkel_id": payload.bengkel_id if payload.pelaksana == "bengkel" else None,
            "polis_id": payload.polis_id if asuransi else None,
            "bengkel_rekanan_id": payload.bengkel_rekanan_id if asuransi else None,
            "no_nota": payload.no_nota,
            "jadwal_mulai": payload.jadwal_mulai.isoformat() if payload.jadwal_mulai else None,
            "estimasi_selesai": payload.estimasi_selesai.isoformat() if payload.estimasi_selesai else None,
            "odometer_km": payload.odometer_km,
        }

    @staticmethod
    def _rincian(payload: PerintahKerjaInput) -> dict[str, list[dict[str, Any]]]:
        mekanik = [] if payload.pelaksana != "internal" else payload.mekanik
        return {
            "perintah_kerja_mekanik": [
                {"mekanik_id": m.mekanik_id, "is_penanggung_jawab": m.is_penanggung_jawab} for m in mekanik
            ],
            "perintah_kerja_jasa": [
                {"id": j.id, "uraian": j.uraian, "mekanik_id": j.mekanik_id or None, "jam_kerja": j.jam_kerja,
                 "biaya": j.biaya, "urutan": i}
                for i, j in enumerate(payload.jasa)
            ],
            "perintah_kerja_sparepart": [
                {"id": p.id, "kode": p.kode, "nama": p.nama, "qty": p.qty, "satuan": p.satuan,
                 "harga_satuan": p.harga_satuan, "keterangan": p.keterangan, "urutan": i}
                for i, p in enumerate(payload.sparepart)
            ],
            "perintah_kerja_biaya_lain": [
                {"id": b.id, "uraian": b.uraian, "biaya": b.biaya, "urutan": i}
                for i, b in enumerate(payload.biaya_lain)
            ],
        }  # fmt: skip

    @staticmethod
    def _klaim(payload: PerintahKerjaInput, own_risk_polis: float | None) -> dict[str, Any]:
        k = payload.klaim
        return {
            "polis_id": payload.polis_id,
            "pic_id": (k.pic_id if k else None) or None,
            "nomor_klaim": k.nomor_klaim if k else None,
            "tanggal_pengajuan": k.tanggal_pengajuan.isoformat() if k and k.tanggal_pengajuan else None,
            "status_klaim": k.status_klaim if k else "diajukan",
            "nilai_diajukan": k.nilai_diajukan if k else None,
            "nilai_disetujui": k.nilai_disetujui if k else None,
            "own_risk": (k.own_risk if k and k.own_risk is not None else own_risk_polis),
            "catatan": k.catatan if k else None,
        }

    async def create(self, payload: PerintahKerjaInput) -> str:
        own_risk = await self._cek_polis(payload)
        wo_id = str(uuid.uuid4())
        tx = Transaksi(self._db)
        tx.insert(
            "perintah_kerja",
            {
                "id": wo_id,
                "unit_id": payload.unit_id or None,
                "unit_trailer_id": payload.unit_trailer_id or None,
                "status_wo": payload.status_wo,
                **self._header(payload),
                **self._total(payload),
            },
        )
        for tabel, baris in self._rincian(payload).items():
            sinkron_anak(tx, tabel, "perintah_kerja_id", wo_id, set(), baris)
        if payload.pelaksana == "asuransi":
            tx.insert("klaim_asuransi", {"perintah_kerja_id": wo_id, **self._klaim(payload, own_risk)})
        await tx.jalankan()
        return wo_id

    async def update(self, wo_id: str, payload: PerintahKerjaInput) -> None:
        lama = await self.get(wo_id)
        if lama.status_wo == "dibatalkan":
            raise ValidationError("Perintah kerja yang sudah dibatalkan tidak bisa diubah.")
        # Aset tidak bisa dipindah setelah WO dibuat.
        payload.unit_id = lama.aset_id if lama.jenis_aset == "unit" else None
        payload.unit_trailer_id = lama.aset_id if lama.jenis_aset == "unit_trailer" else None
        own_risk = await self._cek_polis(payload)
        total = self._total(payload)

        tx = Transaksi(self._db)
        tx.update("perintah_kerja", {**self._header(payload), **total}, {"id": wo_id})
        rincian = self._rincian(payload)
        lama_ids = {
            "perintah_kerja_mekanik": {m.id for m in lama.mekanik},
            "perintah_kerja_jasa": {j.id for j in lama.jasa},
            "perintah_kerja_sparepart": {p.id for p in lama.sparepart},
            "perintah_kerja_biaya_lain": {b.id for b in lama.biaya_lain},
        }
        # Mekanik disinkronkan per mekanik (bukan per id baris): pertahankan
        # baris mekanik yang sama supaya riwayatnya tidak terhapus-tambah.
        per_mekanik = {m.mekanik_id: m.id for m in lama.mekanik}
        rincian["perintah_kerja_mekanik"] = [
            {"id": per_mekanik.get(m["mekanik_id"]), **m} for m in rincian["perintah_kerja_mekanik"]
        ]
        for tabel, baris in rincian.items():
            reset = {"is_penanggung_jawab": False} if tabel == "perintah_kerja_mekanik" else None
            sinkron_anak(tx, tabel, "perintah_kerja_id", wo_id, lama_ids[tabel], baris, reset=reset)

        if payload.pelaksana == "asuransi":
            data_klaim = self._klaim(payload, own_risk)
            if lama.klaim:
                tx.update("klaim_asuransi", data_klaim, {"id": lama.klaim.id})
            else:
                tx.insert("klaim_asuransi", {"perintah_kerja_id": wo_id, **data_klaim})
        elif lama.klaim:
            tx.hapus("klaim_asuransi", {"id": lama.klaim.id})

        # WO selesai dari insiden: biaya insiden ikut diperbarui.
        if lama.status_wo == "selesai" and lama.incident_id:
            tx.update("incident_logs", {"biaya_repair": total["total_biaya"]}, {"id": lama.incident_id}, wajib=False)
        await tx.jalankan()

    async def ubah_status(self, wo_id: str, payload: UbahStatusInput) -> None:
        lama = single(
            await self._db.table("perintah_kerja").select("id, status_wo").eq("id", wo_id).maybe_single().execute()
        )
        if lama is None:
            raise NotFoundError("Perintah kerja tidak ditemukan")
        data: dict[str, Any] = {"status_wo": payload.status_wo}
        if payload.status_wo == "dibatalkan":
            data["alasan_batal"] = payload.alasan_batal
        if payload.status_wo == "selesai":
            if payload.tanggal_selesai:
                data["tanggal_selesai"] = payload.tanggal_selesai.isoformat()
            if payload.odometer_km is not None:
                data["odometer_km"] = payload.odometer_km
        await self._db.table("perintah_kerja").update(data).eq("id", wo_id).execute()

    async def delete(self, wo_id: str) -> None:
        res = await self._db.table("perintah_kerja").delete().eq("id", wo_id).execute()
        if not rows(res):
            raise NotFoundError("Perintah kerja tidak ditemukan")

    # ── Foto & dokumen ──────────────────────────────────────────────────────

    async def upload_foto(
        self, wo_id: str, *, jenis: str, data: bytes, content_type: str | None, nama_file: str | None, user_id: str
    ) -> None:
        ada = single(await self._db.table("perintah_kerja").select("id").eq("id", wo_id).maybe_single().execute())
        if ada is None:
            raise NotFoundError("Perintah kerja tidak ditemukan")
        ext = validate_document(content_type, len(data))
        path = f"perintah_kerja/{wo_id}/{jenis}-{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "application/pdf")
        try:
            await (
                self._db.table("perintah_kerja_foto")
                .insert(
                    {
                        "perintah_kerja_id": wo_id,
                        "jenis": jenis,
                        "file_path": path,
                        "nama_file": (nama_file or "")[:200] or None,
                        "content_type": content_type,
                        "file_size": len(data),
                        "uploaded_by": user_id,
                    }
                )
                .execute()
            )
        except Exception:
            await remove_object_quietly(self._db, self._bucket, path)
            raise

    async def hapus_foto(self, wo_id: str, foto_id: str) -> None:
        res = await (
            self._db.table("perintah_kerja_foto").delete().eq("id", foto_id).eq("perintah_kerja_id", wo_id).execute()
        )
        data = rows(res)
        if not data:
            raise NotFoundError("Foto / dokumen tidak ditemukan")
        await remove_object_quietly(self._db, self._bucket, data[0]["file_path"])

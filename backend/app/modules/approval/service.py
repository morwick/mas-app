"""Approval — master approver & keputusan pengajuan.

Semua aturan (giliran berjenjang, satu tolak = ditolak, pengaju tidak boleh
menyetujui sendiri, penerapan hasil ke data asli) dijalankan fungsi database
(migration 20261001000009/10) dalam satu transaksi. Service ini hanya
memetakan masukan & keluaran.
"""

from __future__ import annotations

from typing import Any

from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.paging import Page, PageParams, build_page
from app.core.pg import num, rows
from app.core.soft_delete import DIHAPUS, STATUS
from app.modules.approval.schemas import (
    Approver,
    ApproverInput,
    FiturApproval,
    FiturApprovalInfo,
    HasilKeputusan,
    KaryawanCalonApprover,
    MenuApproval,
    ModeApproval,
    PengajuanApproval,
    PutuskanInput,
    RiwayatApproval,
    StatusPengajuan,
)


def _limit(params: PageParams) -> int:
    return params.last_index - params.offset + 1


class ApprovalService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Master (superadmin) ─────────────────────────────────────────────────

    async def daftar_fitur(self) -> list[FiturApprovalInfo]:
        fitur = rows(await self._db.table("approval_fitur").select("kode, nama, mode").order("urutan").execute())
        approver = rows(await self._db.table("approver").select("fitur_kode").execute())
        jumlah: dict[str, int] = {}
        for a in approver:
            jumlah[a["fitur_kode"]] = jumlah.get(a["fitur_kode"], 0) + 1
        return [FiturApprovalInfo(**f, jumlah_approver=jumlah.get(f["kode"], 0)) for f in fitur]

    async def ubah_mode(self, kode: FiturApproval, mode: ModeApproval) -> None:
        """Mode baru berlaku untuk pengajuan berikutnya — pengajuan yang sedang
        berjalan memakai mode saat diajukan (disimpan di pengajuan)."""
        res = await self._db.table("approval_fitur").update({"mode": mode}).eq("kode", kode).execute()
        if not rows(res):
            raise NotFoundError("Fitur approval tidak ditemukan")

    async def daftar_approver(self, *, params: PageParams, fitur: str | None, q: str | None) -> Page[Approver]:
        res = await self._db.rpc(
            "daftar_approver",
            {"p_fitur": fitur, "p_q": (q or "").strip() or None, "p_limit": _limit(params), "p_offset": params.offset},
        ).execute()
        data = rows(res)
        items = [
            Approver(
                id=str(r["id"]),
                fitur_kode=r["fitur_kode"],
                fitur_nama=r["fitur_nama"],
                mode=r["mode"],
                karyawan_id=str(r["karyawan_id"]),
                karyawan_nama=r["karyawan_nama"],
                urutan=int(r["urutan"]),
                karyawan_aktif=bool(r["karyawan_aktif"]),
            )
            for r in data
        ]
        return build_page(items, int(data[0]["total"]) if data else 0, params)

    async def calon_approver(self) -> list[KaryawanCalonApprover]:
        res = await self._db.rpc("karyawan_calon_approver", {}).execute()
        return [KaryawanCalonApprover(id=str(r["id"]), nama=r["nama"]) for r in rows(res)]

    async def tambah_approver(self, payload: ApproverInput, *, created_by: str) -> None:
        # Syarat karyawan (aktif + punya akun web) dijaga trigger approver_cek_karyawan.
        try:
            await (
                self._db.table("approver")
                .insert(
                    {
                        "fitur_kode": payload.fitur_kode,
                        "karyawan_id": payload.karyawan_id,
                        "urutan": payload.urutan,
                        "created_by": created_by,
                    }
                )
                .execute()
            )
        except APIError as exc:
            if exc.code == "23505":
                raise ConflictError("Karyawan ini sudah menjadi approver fitur tersebut.") from exc
            raise

    async def ubah_approver(self, approver_id: str, urutan: int) -> None:
        res = await self._db.table("approver").update({"urutan": urutan}).eq("id", approver_id).execute()
        if not rows(res):
            raise NotFoundError("Approver tidak ditemukan")

    async def hapus_approver(self, approver_id: str) -> None:
        """Soft delete. Pengajuan yang sudah berjalan tetap memakai snapshot
        approver-nya (migration 20261001000009)."""
        res = await self._db.table("approver").update({STATUS: DIHAPUS}).eq("id", approver_id).execute()
        if not rows(res):
            raise NotFoundError("Approver tidak ditemukan")

    # ── Approver ────────────────────────────────────────────────────────────

    async def menu_saya(self) -> list[MenuApproval]:
        res = await self._db.rpc("menu_approval_saya", {}).execute()
        return [
            MenuApproval(kode=r["kode"], nama=r["nama"], menunggu_saya=int(r["menunggu_saya"] or 0)) for r in rows(res)
        ]

    async def daftar_pengajuan(
        self,
        *,
        params: PageParams,
        fitur: FiturApproval,
        hanya_giliran: bool,
        status: StatusPengajuan | None,
        q: str | None,
        tahun: int | None,
        bulan: int | None,
    ) -> Page[PengajuanApproval]:
        res = await self._db.rpc(
            "daftar_pengajuan_approval",
            {
                "p_fitur": fitur,
                "p_hanya_giliran": hanya_giliran,
                "p_status": status,
                "p_q": (q or "").strip() or None,
                "p_tahun": tahun,
                "p_bulan": bulan,
                "p_limit": _limit(params),
                "p_offset": params.offset,
            },
        ).execute()
        data = rows(res)
        return build_page([_to_pengajuan(r) for r in data], int(data[0]["total"]) if data else 0, params)

    async def detail_pengajuan(self, fitur: FiturApproval, pengajuan_id: str) -> PengajuanApproval:
        """Satu pengajuan untuk halaman detail. BATASAN: aturan tampil sama dengan
        daftar (dijaga daftar_pengajuan_approval) — mis. approver level 2 belum
        bisa membukanya sebelum level 1 setuju."""
        res = await self._db.rpc(
            "daftar_pengajuan_approval",
            {
                "p_fitur": fitur,
                "p_hanya_giliran": False,
                "p_status": None,
                "p_q": None,
                "p_tahun": None,
                "p_bulan": None,
                "p_limit": 1,
                "p_offset": 0,
                "p_id": pengajuan_id,
            },
        ).execute()
        data = rows(res)
        if not data:
            raise NotFoundError("Pengajuan tidak ditemukan atau belum sampai giliran Anda.")
        return _to_pengajuan(data[0])

    async def riwayat_uang_jalan(self, uang_jalan_id: str) -> RiwayatApproval:
        """Approver & catatan untuk satu baris "Tambah uang jalan". BATASAN: hanya
        staf yang berhak atas job-nya (dijaga riwayat_approval_uang_jalan)."""
        data = rows(
            await self._db.rpc("riwayat_approval_uang_jalan", {"p_uang_jalan_id": uang_jalan_id}).execute()
        )
        if not data:
            raise NotFoundError("Riwayat approval tambahan uang jalan ini tidak ditemukan.")
        r = data[0]
        return RiwayatApproval(
            mode=r["mode"],
            status_approval=r["status_approval"],
            alasan_tolak=r.get("alasan_tolak"),
            diajukan_oleh_nama=r.get("diajukan_oleh_nama"),
            diajukan_at=r["diajukan_at"],
            langkah=r.get("langkah") or [],
        )

    async def putuskan(self, pengajuan_id: str, payload: PutuskanInput) -> HasilKeputusan:
        # BATASAN: alasan wajib saat menolak — dicek di sini untuk pesan cepat,
        # dan dijaga ulang oleh putuskan_approval() di database.
        if not payload.setuju and not payload.catatan:
            raise ValidationError("Alasan penolakan wajib diisi.")
        res = await self._db.rpc(
            "putuskan_approval",
            {"p_pengajuan_id": pengajuan_id, "p_setuju": payload.setuju, "p_catatan": payload.catatan},
        ).execute()
        return HasilKeputusan(status_approval=str(res.data))  # type: ignore[arg-type]


def _to_pengajuan(r: dict[str, Any]) -> PengajuanApproval:
    return PengajuanApproval(
        id=str(r["id"]),
        fitur_kode=r["fitur_kode"],
        ref_id=str(r["ref_id"]),
        judul=r["judul"],
        rincian=r.get("rincian") or {},
        nilai=None if r.get("nilai") is None else num(r["nilai"]),
        mode=r["mode"],
        status_approval=r["status_approval"],
        diajukan_oleh_nama=r.get("diajukan_oleh_nama"),
        diajukan_at=r["diajukan_at"],
        diputuskan_at=r.get("diputuskan_at"),
        alasan_tolak=r.get("alasan_tolak"),
        giliran_saya=bool(r.get("giliran_saya")),
        langkah=r.get("langkah") or [],
    )

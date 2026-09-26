import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { AsetDokumen, JenisAset } from "@/features/penjualan-unit/api";
import type { ActionResult } from "@/types";

export { JENIS_ASET, type JenisAset } from "@/features/penjualan-unit/api";

/**
 * Penghapusan unit & unit trailer — satu-satunya jalan menandai aset
 * "Diafkirkan" (migration 20260926000008). Superadmin saja.
 */
export interface PenghapusanAset {
  id: string;
  /** Nomor otomatis berita acara penghapusan. */
  nomor_berita_acara: string | null;
  jenis_aset: JenisAset;
  unit_id: string | null;
  unit_trailer_id: string | null;
  kode_aset: string;
  tanggal_hapus: string;
  alasan: string;
  catatan: string | null;
  status_aset_sebelum: string | null;
  bukti_uploaded_at: string | null;
  /** Hanya terisi di detail — URL bertanda tangan sementara. */
  bukti_url: string | null;
  created_by_nama: string | null;
  created_at: string;
  aset: AsetDokumen | null;
}

/** Isian yang boleh diedit — aset & nomor berita acara tetap. */
export interface PenghapusanAsetUbah {
  tanggal_hapus: string;
  alasan: string;
  catatan: string | null;
}

export interface PenghapusanAsetInput extends PenghapusanAsetUbah {
  jenis_aset: JenisAset;
  asset_id: string;
}

/** Berita acara bertanda tangan sudah diunggah → tidak bisa diedit / dibatalkan. */
export function penghapusanTerkunci(p: Pick<PenghapusanAset, "bukti_uploaded_at">): boolean {
  return Boolean(p.bukti_uploaded_at);
}

/** Insiden yang ditutup saat aset dihapus, dibuka lagi saat penghapusan dibatalkan. */
export interface InsidenDibukaLagi {
  id: string;
  status: "open" | "in_progress";
}

export interface AsetDihapus {
  id: string;
  kode: string;
  jenis_nama: string | null;
  status: string;
  /** Terisi bila aset tidak bisa dihapus (sedang Bertugas). */
  alasan_tidak_bisa: string | null;
  /** Insiden yang belum selesai — ikut ditutup "Selesai (diafkirkan)". */
  insiden_terbuka: number;
}

export interface PenghapusanPage {
  items: PenghapusanAset[];
  total: number;
  page: number;
  page_size: number;
}

export interface PenghapusanFilter {
  page: number;
  pageSize: number;
  q: string;
  jenisAset: JenisAset | "";
}

export const listPenghapusan = (f: PenghapusanFilter) =>
  api.get<PenghapusanPage>("/penghapusan-aset", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    jenis_aset: f.jenisAset || undefined
  });

export const getPenghapusan = (id: string) => api.get<PenghapusanAset>(`/penghapusan-aset/${id}`);

export const asetDihapusPilihan = (jenisAset: JenisAset) =>
  api.get<AsetDihapus[]>("/penghapusan-aset/aset-pilihan", { jenis_aset: jenisAset });

export function createPenghapusan(input: PenghapusanAsetInput): Promise<ActionResult<{ id: string }>> {
  return mutate(api.post<{ id: string }>("/penghapusan-aset", input));
}

export function updatePenghapusan(id: string, input: PenghapusanAsetUbah): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/penghapusan-aset/${id}`, input));
}

/** Batalkan: catatan dihapus (soft delete), aset kembali Standby & insidennya dibuka lagi. */
export function batalkanPenghapusan(
  id: string,
  alasan: string,
  insiden: InsidenDibukaLagi[]
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/penghapusan-aset/${id}/batalkan`, { alasan, insiden }));
}

export function uploadBuktiPenghapusan(id: string, file: File): Promise<ActionResult<unknown>> {
  const form = new FormData();
  form.append("file", file);
  return mutate(api.upload(`/penghapusan-aset/${id}/bukti`, form));
}

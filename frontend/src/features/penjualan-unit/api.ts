import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

export type JenisAset = "unit" | "unit_trailer";

export const JENIS_ASET: { value: JenisAset; label: string }[] = [
  { value: "unit", label: "Unit" },
  { value: "unit_trailer", label: "Unit Trailer" }
];

/** Data aset yang dicetak di surat penjualan, BAST, dan berita acara penghapusan. */
export interface AsetDokumen {
  kode: string;
  jenis_nama: string | null;
  no_polisi: string | null;
  tahun: number | null;
  kapasitas_ton: number | null;
  stnk_nomor: string | null;
  kir_nomor: string | null;
  srut_nomor: string | null;
}

export interface PenjualanUnit {
  id: string;
  /** Nomor otomatis surat penjualan & berita acara serah terima (BAST). */
  nomor_surat: string | null;
  nomor_bast: string | null;
  jenis_aset: JenisAset;
  unit_id: string | null;
  unit_trailer_id: string | null;
  kode_aset: string;
  nama_pembeli: string;
  no_hp_pembeli: string | null;
  email_pembeli: string | null;
  harga_jual: number;
  tanggal_jual: string;
  catatan: string | null;
  /** Orang yang menyerahkan unit — tercetak di tanda tangan penjual / PIHAK PERTAMA. */
  penyerah_nama: string | null;
  penyerah_jabatan: string | null;
  /** Surat penjualan & BAST bertanda tangan (opsional, boleh tidak bersamaan). */
  bukti_uploaded_at: string | null;
  bukti_bast_uploaded_at: string | null;
  /** Hanya terisi di detail — URL bertanda tangan sementara. */
  bukti_url: string | null;
  bukti_bast_url: string | null;
  created_by_nama: string | null;
  created_at: string;
  aset: AsetDokumen | null;
}

/** Isian yang boleh diedit — aset & nomor dokumen tetap. */
export interface PenjualanUnitUbah {
  nama_pembeli: string;
  no_hp_pembeli: string | null;
  email_pembeli: string | null;
  harga_jual: number;
  tanggal_jual: string;
  catatan: string | null;
  penyerah_nama: string | null;
  penyerah_jabatan: string | null;
}

/** Surat / BAST sudah bertanda tangan → penjualan tidak bisa diedit / dibatalkan. */
export function penjualanTerkunci(p: Pick<PenjualanUnit, "bukti_uploaded_at" | "bukti_bast_uploaded_at">): boolean {
  return Boolean(p.bukti_uploaded_at || p.bukti_bast_uploaded_at);
}

export interface PenjualanUnitInput {
  jenis_aset: JenisAset;
  asset_id: string;
  penyerah_nama: string | null;
  penyerah_jabatan: string | null;
  nama_pembeli: string;
  no_hp_pembeli: string | null;
  email_pembeli: string | null;
  harga_jual: number;
  tanggal_jual: string;
  catatan: string | null;
}

export interface AsetPilihan {
  id: string;
  kode: string;
  jenis_nama: string | null;
  status: string;
  /** Terisi bila aset tidak bisa dijual (Bertugas / Perbaikan / Terjual). */
  alasan_tidak_bisa: string | null;
  /** Insiden yang belum selesai (aset Breakdown) — ditutup "Selesai (terjual)" saat dijual. */
  insiden_terbuka: number;
}

export interface PenjualanPage {
  items: PenjualanUnit[];
  total: number;
  page: number;
  page_size: number;
}

export interface PenjualanFilter {
  page: number;
  pageSize: number;
  q: string;
  jenisAset: JenisAset | "";
}

export const listPenjualan = (f: PenjualanFilter) =>
  api.get<PenjualanPage>("/penjualan-unit", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    jenis_aset: f.jenisAset || undefined
  });

export const getPenjualan = (id: string) => api.get<PenjualanUnit>(`/penjualan-unit/${id}`);

export const asetPilihan = (jenisAset: JenisAset) =>
  api.get<AsetPilihan[]>("/penjualan-unit/aset-pilihan", { jenis_aset: jenisAset });

export function createPenjualan(input: PenjualanUnitInput): Promise<ActionResult<{ id: string }>> {
  return mutate(api.post<{ id: string }>("/penjualan-unit", input));
}

export function updatePenjualan(id: string, input: PenjualanUnitUbah): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/penjualan-unit/${id}`, input));
}

/** Batalkan: catatan dihapus (soft delete) & aset kembali ke status sebelum dijual. */
export function batalkanPenjualan(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/penjualan-unit/${id}/batalkan`));
}

/** Surat penjualan / BAST bertanda tangan. */
export type DokumenTtd = "surat" | "bast";

export function uploadBuktiPenjualan(id: string, dokumen: DokumenTtd, file: File): Promise<ActionResult<unknown>> {
  const form = new FormData();
  form.append("file", file);
  return mutate(api.upload(`/penjualan-unit/${id}/bukti?dokumen=${dokumen}`, form));
}

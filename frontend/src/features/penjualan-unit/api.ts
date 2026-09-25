import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

export type JenisAset = "unit" | "unit_trailer";

export const JENIS_ASET: { value: JenisAset; label: string }[] = [
  { value: "unit", label: "Unit" },
  { value: "unit_trailer", label: "Unit Trailer" }
];

export interface PenjualanUnit {
  id: string;
  jenis_aset: JenisAset;
  unit_id: string | null;
  unit_trailer_id: string | null;
  kode_aset: string;
  nama_pembeli: string;
  kontak_pembeli: string | null;
  harga_jual: number;
  tanggal_jual: string;
  catatan: string | null;
  bukti_uploaded_at: string | null;
  /** Hanya terisi di detail — URL bertanda tangan sementara. */
  bukti_url: string | null;
  created_by_nama: string | null;
  created_at: string;
}

export interface PenjualanUnitInput {
  jenis_aset: JenisAset;
  asset_id: string;
  nama_pembeli: string;
  kontak_pembeli: string | null;
  harga_jual: number;
  tanggal_jual: string;
  catatan: string | null;
}

export interface AsetPilihan {
  id: string;
  kode: string;
  jenis_nama: string | null;
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

/** Batalkan: catatan dihapus (soft delete) & aset kembali Standby. */
export function batalkanPenjualan(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/penjualan-unit/${id}/batalkan`));
}

export function uploadBuktiPenjualan(id: string, file: File): Promise<ActionResult<unknown>> {
  const form = new FormData();
  form.append("file", file);
  return mutate(api.upload(`/penjualan-unit/${id}/bukti`, form));
}

import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  KeputusanItem,
  Quotation,
  QuotationJobRef,
  QuotationListRow,
  QuotationStatus,
  RekomendasiHarga
} from "@/types";

export interface QuotationItemInput {
  /** Teks yang dicetak di surat. */
  dari: string;
  tujuan: string;
  dari_kecamatan_kode: string;
  tujuan_kecamatan_kode: string;
  jenis_unit_id: string;
  qty: number;
  satuan: string;
  nama_alat?: string | null;
  harga_satuan: number;
}

export interface QuotationInput {
  customer_id: string;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  kota_terbit: string;
  tanggal: string;
  berlaku_sampai: string;
  perihal: string;
  objek?: string | null;
  lampiran?: string | null;
  ppn_aktif: boolean;
  ppn_persen: number;
  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  catatan?: string | null;
  items: QuotationItemInput[];
}

export const listQuotations = (opts?: { status?: QuotationStatus; customerId?: string }) =>
  api.get<QuotationListRow[]>("/quotations", {
    status: opts?.status,
    customer_id: opts?.customerId
  });

export const getQuotation = (id: string) => api.get<Quotation>(`/quotations/${id}`);
export const quotationJobs = (id: string) => api.get<QuotationJobRef[]>(`/quotations/${id}/jobs`);
export interface RekomendasiHargaParams {
  dariKecamatanKode: string;
  tujuanKecamatanKode: string;
  jenisUnitId: string;
  customerId?: string;
  /** Penawaran yang sedang diedit — tidak ikut jadi rekomendasi. */
  kecualiQuotationId?: string;
}

export const rekomendasiHarga = (p: RekomendasiHargaParams) =>
  api.get<RekomendasiHarga[]>("/quotations/rekomendasi-harga", {
    dari_kecamatan_kode: p.dariKecamatanKode,
    tujuan_kecamatan_kode: p.tujuanKecamatanKode,
    jenis_unit_id: p.jenisUnitId,
    customer_id: p.customerId || undefined,
    kecuali_quotation_id: p.kecualiQuotationId || undefined
  });

export const peekNextQuotationNumber = () =>
  api.get<{ nomor: string }>("/quotations/next-number").then((r) => r.nomor);

export function createQuotation(
  input: QuotationInput
): Promise<ActionResult<{ id: string; quote_number: string }>> {
  return mutate(api.post("/quotations", input));
}

export function updateQuotation(id: string, input: QuotationInput): Promise<ActionResult<unknown>> {
  return mutate(api.put(`/quotations/${id}`, input));
}

export function setQuotationStatus(
  id: string,
  status: QuotationStatus,
  opts?: { alasan?: string | null }
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/quotations/${id}/status`, { status, alasan: opts?.alasan ?? null }));
}

/**
 * Catat cetak surat penawaran di log sistem (karyawan, waktu, IP). Tanpa
 * invalidasi query — data penawaran tidak berubah.
 */
export async function catatCetakPenawaran(id: string, versi: "asli" | "revisi"): Promise<ActionResult<unknown>> {
  try {
    await api.post(`/quotations/${id}/cetak`, { versi });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal mencatat cetak" };
  }
}

/** Simpan tanggal surat versi revisi & masa berlakunya (dipanggil saat cetak). */
export function simpanSuratRevisi(
  id: string,
  input: { tanggal: string; berlaku_sampai: string }
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/quotations/${id}/surat-revisi`, input));
}

export interface KeputusanItemInput {
  item_id: string;
  keputusan: KeputusanItem;
  /** Rupiah penuh, hanya untuk item deal. null = harga awal. */
  harga_revisi: number | null;
  alasan: string | null;
}

/** Keputusan deal / tolak (+ revisi harga) per item — status penawaran dihitung ulang. */
export function simpanKeputusanItem(
  id: string,
  items: KeputusanItemInput[]
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/quotations/${id}/keputusan`, { items }));
}

export function deleteQuotation(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/quotations/${id}`));
}

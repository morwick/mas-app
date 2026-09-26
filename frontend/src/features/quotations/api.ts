import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  KeputusanItem,
  Quotation,
  QuotationJobRef,
  QuotationListRow,
  QuotationStatus
} from "@/types";

export interface QuotationItemInput {
  dari: string;
  tujuan: string;
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

import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  Invoice,
  InvoiceListRow,
  InvoiceStatus,
  JobBelumDitagihRow,
  JobProfitabilityRow,
  PiutangSummaryRow
} from "@/types";

export interface InvoiceItemInput {
  /** Job yang ditagihkan baris ini. Null untuk baris di luar job. */
  job_id?: string | null;
  deskripsi: string;
  dari?: string | null;
  tujuan?: string | null;
  qty: number;
  satuan: string;
  harga_satuan: number;
}

export interface InvoiceInput {
  customer_id: string;
  quotation_id?: string | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  kota_terbit: string;
  tanggal: string;
  termin_hari?: number | null;
  jatuh_tempo?: string | null;
  ppn_aktif: boolean;
  ppn_persen: number;
  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  bank_nama?: string | null;
  bank_rekening?: string | null;
  bank_atas_nama?: string | null;
  catatan?: string | null;
  items: InvoiceItemInput[];
}

export interface PaymentInput {
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  metode?: string | null;
  referensi?: string | null;
  catatan?: string | null;
}

export const listInvoices = (opts?: { status?: InvoiceStatus; customerId?: string }) =>
  api.get<InvoiceListRow[]>("/invoices", { status: opts?.status, customer_id: opts?.customerId });

export const getInvoice = (id: string) => api.get<Invoice>(`/invoices/${id}`);

export const peekNextInvoiceNumber = () =>
  api.get<{ nomor: string }>("/invoices/next-number").then((r) => r.nomor);

export const jobsBelumDitagih = (customerId?: string) =>
  api.get<Record<string, JobBelumDitagihRow[]>>("/invoices/jobs-belum-ditagih", {
    customer_id: customerId
  });

export const piutangSummary = () => api.get<PiutangSummaryRow[]>("/piutang/summary");

export const jobProfitability = (start?: string, end?: string) =>
  api.get<JobProfitabilityRow[]>("/reports/profitability", { start, end });

export function createInvoice(
  input: InvoiceInput
): Promise<ActionResult<{ id: string; invoice_number: string }>> {
  return mutate(api.post("/invoices", input));
}

export function updateInvoice(id: string, input: InvoiceInput): Promise<ActionResult<unknown>> {
  return mutate(api.put(`/invoices/${id}`, input));
}

export function setInvoiceStatus(
  id: string,
  status: Exclude<InvoiceStatus, "lunas">,
  opts?: { alasan?: string | null }
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/invoices/${id}/status`, { status, alasan: opts?.alasan ?? null }));
}

export function addInvoicePayment(
  invoiceId: string,
  input: PaymentInput
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/invoices/${invoiceId}/payments`, input));
}

export function deleteInvoicePayment(
  paymentId: string,
  invoiceId: string
): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/invoices/${invoiceId}/payments/${paymentId}`));
}

export function deleteInvoice(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/invoices/${id}`));
}

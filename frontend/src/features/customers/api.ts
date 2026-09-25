import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, Customer } from "@/types";

export interface CustomerInput {
  nama_perusahaan: string;
  alamat?: string | null;
  catatan?: string | null;
  kota?: string | null;
  npwp?: string | null;
  nib?: string | null;
  status_pkp?: boolean;
  termin_hari?: number | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  pic_jabatan?: string | null;
  pic_no_hp?: string | null;
  pic_email?: string | null;
}

export const listCustomers = (includeInactive = false) =>
  api.get<Customer[]>("/customers", { include_inactive: includeInactive });

export const getCustomer = (id: string) => api.get<Customer>(`/customers/${id}`);

export const customerJobCounts = () => api.get<Record<string, number>>("/customers/job-counts");

export const customerQuotationCounts = () =>
  api.get<Record<string, number>>("/customers/quotation-counts");

export function createCustomer(input: CustomerInput): Promise<ActionResult<Customer>> {
  return mutate(api.post<Customer>("/customers", input));
}

export function updateCustomer(
  id: string,
  input: Partial<CustomerInput>
): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/customers/${id}`, input));
}

export function deactivateCustomer(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/customers/${id}/deactivate`));
}

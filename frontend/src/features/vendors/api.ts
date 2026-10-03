/** Master vendor — sementara disamakan dengan customer (akan dirombak sesuai kebutuhan). */
import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, Vendor } from "@/types";

export interface VendorInput {
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

export const listVendors = (includeInactive = false) =>
  api.get<Vendor[]>("/vendors", { include_inactive: includeInactive });

export const getVendor = (id: string) => api.get<Vendor>(`/vendors/${id}`);



export function createVendor(input: VendorInput): Promise<ActionResult<Vendor>> {
  return mutate(api.post<Vendor>("/vendors", input));
}

export function updateVendor(
  id: string,
  input: Partial<VendorInput>
): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/vendors/${id}`, input));
}

export function deactivateVendor(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/vendors/${id}/deactivate`));
}

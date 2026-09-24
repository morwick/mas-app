import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

export interface Karyawan {
  id: string;
  nama: string;
  tanggal_lahir: string | null;
  alamat: string | null;
  /** Nonaktif = akun pengguna & driver miliknya tidak bisa login/dipakai. */
  is_active: boolean;
  akun: { user_id: string; role: "superadmin" | "operator"; email: string | null }[];
  driver: { id: string; no_hp: string | null } | null;
}

export interface KaryawanPage {
  items: Karyawan[];
  total: number;
  page: number;
  page_size: number;
}

export type FilterAktif = "" | "aktif" | "nonaktif";

export interface KaryawanFilter {
  page: number;
  pageSize: number;
  q: string;
  aktif: FilterAktif;
}

export interface KaryawanInput {
  nama: string;
  tanggal_lahir: string | null;
  alamat: string | null;
  is_active: boolean;
}

export const listKaryawan = (f: KaryawanFilter) =>
  api.get<KaryawanPage>("/karyawan", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    aktif: f.aktif || undefined
  });

export function createKaryawan(input: KaryawanInput): Promise<ActionResult<{ id: string }>> {
  return mutate(api.post<{ id: string }>("/karyawan", input));
}

export function updateKaryawan(id: string, input: KaryawanInput): Promise<ActionResult<{ id: string }>> {
  return mutate(api.patch<{ id: string }>(`/karyawan/${id}`, input));
}

/** Soft delete di server (status = 2). */
export function deleteKaryawan(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/karyawan/${id}`));
}

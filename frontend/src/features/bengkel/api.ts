import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ServerPage } from "@/lib/server-page";
import type { ActionResult } from "@/types";

export interface Bengkel {
  id: string;
  nama: string;
  alamat: string | null;
  pic_nama: string | null;
  no_hp: string | null;
  spesialisasi: string | null;
  catatan: string | null;
  is_active: boolean;
}

export type BengkelInput = Omit<Bengkel, "id" | "is_active">;

export interface MasterFilter {
  page: number;
  pageSize: number;
  q: string;
  aktif: "aktif" | "nonaktif" | "";
}

const params = (f: MasterFilter) => ({
  page: f.page,
  page_size: f.pageSize,
  q: f.q.trim() || undefined,
  aktif: f.aktif || undefined
});

export const listBengkelPage = (f: MasterFilter) => api.get<ServerPage<Bengkel>>("/bengkel/page", params(f));
export const bengkelCounts = (q: string) =>
  api.get<{ active: number; inactive: number; all: number }>("/bengkel/counts", { q: q.trim() || undefined });
export const listBengkel = (includeInactive = false) =>
  api.get<Bengkel[]>("/bengkel", { include_inactive: includeInactive });

export const createBengkel = (input: BengkelInput): Promise<ActionResult<Bengkel>> =>
  mutate(api.post<Bengkel>("/bengkel", input));
export const updateBengkel = (id: string, input: BengkelInput): Promise<ActionResult<unknown>> =>
  mutate(api.patch(`/bengkel/${id}`, input));
export const setBengkelAktif = (id: string, aktif: boolean): Promise<ActionResult<unknown>> =>
  mutate(api.post(`/bengkel/${id}/${aktif ? "active" : "deactivate"}`));
export const deleteBengkel = (id: string): Promise<ActionResult<unknown>> => mutate(api.delete(`/bengkel/${id}`));

export const useBengkelPage = (f: MasterFilter) =>
  useQuery({ queryKey: ["bengkel", "page", f], queryFn: () => listBengkelPage(f), placeholderData: keepPreviousData });
export const useBengkelCounts = (q: string) =>
  useQuery({ queryKey: ["bengkel", "counts", q], queryFn: () => bengkelCounts(q) });
export const useBengkelList = (includeInactive = false) =>
  useQuery({ queryKey: ["bengkel", "list", includeInactive], queryFn: () => listBengkel(includeInactive) });

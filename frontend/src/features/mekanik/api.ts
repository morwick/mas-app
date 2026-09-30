import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ServerPage } from "@/lib/server-page";
import type { MasterFilter } from "@/features/bengkel/api";
import type { ActionResult } from "@/types";

export interface Mekanik {
  id: string;
  karyawan_id: string;
  /** Nama mengikuti data karyawan. */
  nama: string;
  no_hp: string | null;
  keahlian: string | null;
  catatan: string | null;
  is_active: boolean;
  /** False = karyawannya sudah nonaktif. */
  karyawan_aktif: boolean;
}

export interface MekanikInput {
  karyawan_id: string;
  no_hp: string | null;
  keahlian: string | null;
  catatan: string | null;
}

export interface KaryawanMekanikOption {
  id: string;
  nama: string;
  mekanik_id: string | null;
}

export const listMekanikPage = (f: MasterFilter) =>
  api.get<ServerPage<Mekanik>>("/mekanik/page", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    aktif: f.aktif || undefined
  });
export const listMekanik = (includeInactive = false) =>
  api.get<Mekanik[]>("/mekanik", { include_inactive: includeInactive });
export const listKaryawanMekanik = () => api.get<KaryawanMekanikOption[]>("/mekanik/karyawan-pilihan");

export const createMekanik = (input: MekanikInput): Promise<ActionResult<unknown>> =>
  mutate(api.post("/mekanik", input));
export const updateMekanik = (id: string, input: MekanikInput): Promise<ActionResult<unknown>> =>
  mutate(api.patch(`/mekanik/${id}`, input));
export const setMekanikAktif = (id: string, aktif: boolean): Promise<ActionResult<unknown>> =>
  mutate(api.post(`/mekanik/${id}/${aktif ? "active" : "deactivate"}`));
export const deleteMekanik = (id: string): Promise<ActionResult<unknown>> => mutate(api.delete(`/mekanik/${id}`));

export const useMekanikPage = (f: MasterFilter) =>
  useQuery({ queryKey: ["mekanik", "page", f], queryFn: () => listMekanikPage(f), placeholderData: keepPreviousData });
export const useMekanikList = (includeInactive = false) =>
  useQuery({ queryKey: ["mekanik", "list", includeInactive], queryFn: () => listMekanik(includeInactive) });
export const useKaryawanMekanik = () =>
  useQuery({ queryKey: ["mekanik", "karyawan-pilihan"], queryFn: listKaryawanMekanik });

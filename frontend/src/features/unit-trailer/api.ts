import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

export type StatusTrailer = "standby" | "perbaikan";

/** "terjual" hanya lewat menu Penjualan Unit — bisa tampil, tidak bisa dipilih di form. */
export type StatusTrailerTampil = StatusTrailer | "terjual";

export const STATUS_TRAILER: { value: StatusTrailer; label: string }[] = [
  { value: "standby", label: "Standby" },
  { value: "perbaikan", label: "Perbaikan" }
];

export const STATUS_TRAILER_TAMPIL: { value: StatusTrailerTampil; label: string }[] = [
  ...STATUS_TRAILER,
  { value: "terjual", label: "Terjual" }
];

export interface UnitTrailer {
  id: string;
  kode_trailer: string;
  tahun: number | null;
  jenis_unit_trailer_id: string;
  jenis_nama: string | null;
  /** Jenis Unit (truk) yang terhubung ke jenis unit trailer-nya. */
  jenis_unit_nama: string | null;
  kapasitas_ton: number | null;
  status: StatusTrailerTampil;
}

export interface UnitTrailerInput {
  kode_trailer: string;
  tahun: number | null;
  jenis_unit_trailer_id: string;
  kapasitas_ton: number | null;
  status: StatusTrailer;
}

export interface UnitTrailerPage {
  items: UnitTrailer[];
  total: number;
  page: number;
  page_size: number;
}

export interface UnitTrailerFilter {
  page: number;
  pageSize: number;
  q: string;
  status: StatusTrailerTampil | "";
  jenisUnitTrailerId: string;
}

/** Master Jenis Unit Trailer — tabel sendiri, beda dengan Jenis Unit (truk). */
export interface JenisUnitTrailer {
  id: string;
  nama: string;
  /** Wajib: setiap jenis unit trailer terhubung ke satu Jenis Unit. */
  jenis_unit_id: string;
  jenis_unit_nama: string | null;
}

export const listJenisUnitTrailer = () => api.get<JenisUnitTrailer[]>("/unit-trailer/jenis");

export function createJenisUnitTrailer(
  nama: string,
  jenisUnitId: string
): Promise<ActionResult<JenisUnitTrailer>> {
  return mutate(api.post<JenisUnitTrailer>("/unit-trailer/jenis", { nama, jenis_unit_id: jenisUnitId }));
}

/** Pilihan unit trailer untuk form job, berdasarkan unit yang dipilih. */
export interface TrailerUntukUnit {
  /** True bila jenis unit dari unit itu punya jenis unit trailer → trailer wajib diisi. */
  wajib: boolean;
  trailer: { id: string; kode_trailer: string; jenis_nama: string | null; status: StatusTrailer }[];
}

export const trailerUntukUnit = (unitId: string) =>
  api.get<TrailerUntukUnit>(`/unit-trailer/untuk-unit/${unitId}`);

export const listUnitTrailer = (f: UnitTrailerFilter) =>
  api.get<UnitTrailerPage>("/unit-trailer", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    status: f.status || undefined,
    jenis_unit_trailer_id: f.jenisUnitTrailerId || undefined
  });

export function createUnitTrailer(input: UnitTrailerInput): Promise<ActionResult<UnitTrailer>> {
  return mutate(api.post<UnitTrailer>("/unit-trailer", input));
}

export function updateUnitTrailer(id: string, input: UnitTrailerInput): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/unit-trailer/${id}`, input));
}

/** Soft delete di server: UPDATE unit_trailer SET status = 2. */
export function deleteUnitTrailer(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/unit-trailer/${id}`));
}

import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  Incident,
  Job,
  RiwayatAset,
  UnitStatus,
  UnitStatusHistoryEntry
} from "@/types";

/**
 * Status unit trailer sama dengan status unit (migration 20260926000006) dan
 * tidak diisi di form: Bertugas dari job, Breakdown / Perbaikan dari insiden,
 * Terjual dari Penjualan Unit & Unit Trailer; manual hanya Standby / Diafkirkan.
 */
export type StatusTrailerTampil = UnitStatus;

export const STATUS_TRAILER_TAMPIL: { value: StatusTrailerTampil; label: string }[] = [
  { value: "standby", label: "Standby" },
  { value: "bertugas", label: "Bertugas" },
  { value: "breakdown", label: "Breakdown" },
  { value: "perbaikan", label: "Perbaikan" },
  { value: "terjual", label: "Terjual" },
  { value: "diafkirkan", label: "Diafkirkan" }
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
  /** Dokumen (opsional): KIR & SRUT (Surat Registrasi Uji Tipe). */
  kir_nomor: string | null;
  kir_berlaku_sampai: string | null;
  srut_nomor: string | null;
  srut_tanggal: string | null;
  /** False = dinonaktifkan: tidak muncul di pilihan job, penjualan, penghapusan. */
  is_active: boolean;
}

export interface UnitTrailerInput {
  kode_trailer: string;
  tahun: number | null;
  jenis_unit_trailer_id: string;
  kapasitas_ton: number | null;
  kir_nomor: string | null;
  kir_berlaku_sampai: string | null;
  srut_nomor: string | null;
  srut_tanggal: string | null;
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
  trailer: { id: string; kode_trailer: string; jenis_nama: string | null; status: StatusTrailerTampil }[];
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

// ── Detail (setara detail unit) ─────────────────────────────────────────────
export const getUnitTrailer = (id: string) => api.get<UnitTrailer>(`/unit-trailer/${id}`);
export const getUnitTrailerJobs = (id: string) => api.get<Job[]>(`/unit-trailer/${id}/jobs`);
export const getUnitTrailerIncidents = (id: string) =>
  api.get<Incident[]>(`/unit-trailer/${id}/incidents`);
export const getUnitTrailerHistory = (id: string) =>
  api.get<UnitStatusHistoryEntry[]>(`/unit-trailer/${id}/status-history`);

export function createUnitTrailer(input: UnitTrailerInput): Promise<ActionResult<UnitTrailer>> {
  return mutate(api.post<UnitTrailer>("/unit-trailer", input));
}

export function updateUnitTrailer(id: string, input: UnitTrailerInput): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/unit-trailer/${id}`, input));
}

export const getUnitTrailerRiwayat = (id: string) => api.get<RiwayatAset>(`/unit-trailer/${id}/riwayat`);

/** Hanya trailer tanpa riwayat — ditolak server bila sudah punya riwayat. */
export function deleteUnitTrailer(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/unit-trailer/${id}`));
}

export function nonaktifkanUnitTrailer(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/unit-trailer/${id}/nonaktifkan`));
}

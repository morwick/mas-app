import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import { localInputToIso } from "@/lib/utils";
import type {
  RiwayatAset,
  ActionResult,
  DriverAssignment,
  Incident,
  IncidentPhoto,
  IncidentStatus,
  IncidentType,
  Job,
  ServiceRecord,
  Unit,
  UnitStatus,
  UnitStatusHistoryEntry
} from "@/types";

// ── Unit ────────────────────────────────────────────────────────────────────

export interface UnitInput {
  kode_unit: string;
  jenis_unit_id: string;
  no_polisi: string;
  tahun?: number | null;
  status?: UnitStatus;
  catatan?: string | null;
  default_driver_id?: string | null;
  imei_gps?: string | null;
  tracksolid_share_link?: string | null;
  stnk_nomor?: string | null;
  stnk_berlaku_sampai?: string | null;
  kir_nomor?: string | null;
  kir_berlaku_sampai?: string | null;
  pajak_berlaku_sampai?: string | null;
}

export const listUnits = (includeInactive = false) =>
  api.get<Unit[]>("/units", { include_inactive: includeInactive });

export const getUnit = (id: string) => api.get<Unit>(`/units/${id}`);
export const getUnitStatusHistory = (id: string) =>
  api.get<UnitStatusHistoryEntry[]>(`/units/${id}/status-history`);
export const getUnitJobs = (id: string) => api.get<Job[]>(`/units/${id}/jobs`);
export const getUnitIncidents = (id: string) => api.get<Incident[]>(`/units/${id}/incidents`);
export const getUnitServices = (id: string) => api.get<ServiceRecord[]>(`/units/${id}/services`);
export const getDriverAssignments = () =>
  api.get<Record<string, DriverAssignment>>("/units/driver-assignments");

export function createUnit(input: UnitInput): Promise<ActionResult<Unit>> {
  return mutate(api.post<Unit>("/units", input));
}

export function updateUnit(id: string, input: Partial<UnitInput>): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/units/${id}`, input));
}

export function deactivateUnit(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/units/${id}/deactivate`));
}

export const getUnitRiwayat = (id: string) => api.get<RiwayatAset>(`/units/${id}/riwayat`);

/** Hanya unit tanpa riwayat — ditolak server bila sudah punya riwayat. */
export function deleteUnit(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/units/${id}`));
}

// ── Insiden ─────────────────────────────────────────────────────────────────

export interface IncidentInput {
  /** Tepat satu terisi: insiden unit atau insiden unit trailer. */
  unit_id?: string;
  unit_trailer_id?: string;
  job_id?: string | null;
  tipe: IncidentType;
  tanggal: string;
  lokasi?: string | null;
  deskripsi: string;
  biaya_repair?: number | null;
  vendor_repair?: string | null;
}

export function createIncident(input: IncidentInput): Promise<ActionResult<Incident>> {
  return mutate(api.post<Incident>("/incidents", { ...input, tanggal: localInputToIso(input.tanggal) }));
}

export function updateIncident(
  id: string,
  input: Partial<Omit<IncidentInput, "unit_id" | "unit_trailer_id">>
): Promise<ActionResult<unknown>> {
  return mutate(
    api.patch(`/incidents/${id}`, input.tanggal ? { ...input, tanggal: localInputToIso(input.tanggal) } : input)
  );
}

export function setIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/incidents/${id}/status`, { status }));
}

/** Selesaikan perbaikan — status unit ikut kembali (Standby) lewat trigger DB. */
export function resolveIncident(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/incidents/${id}/resolve`));
}

export function deleteIncident(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/incidents/${id}`));
}

/** Foto diunggah lewat backend, yang meneruskannya ke Supabase Storage. */
export function uploadIncidentPhoto(
  incidentId: string,
  file: Blob,
  fileName = "foto.jpg"
): Promise<ActionResult<IncidentPhoto>> {
  const form = new FormData();
  form.append("photo", file, fileName);
  return mutate(api.upload<IncidentPhoto>(`/incidents/${incidentId}/photos`, form));
}

export function deleteIncidentPhoto(
  incidentId: string,
  photoId: string
): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/incidents/${incidentId}/photos/${photoId}`));
}

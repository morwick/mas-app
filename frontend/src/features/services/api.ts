import { queryClient } from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, JenisService, ServiceRecord, UnitWithService } from "@/types";

export interface CreateServiceInput {
  unit_id: string;
  tanggal: string;
  odometer_km: number;
  jenis: JenisService;
  catatan?: string | null;
}

export interface MileageEntry {
  km: number;
  fetched_at: string;
}

export interface MileageBatchResponse {
  daily: Record<string, MileageEntry | null>;
  odometers: Record<string, number>;
}

export interface SyncMileageResponse {
  ok: true;
  km: number;
  current_odometer_km: number | null;
}

export interface MileageAtResponse {
  ok: true;
  date: string;
  akumulasi_km: number | null;
  current_akumulasi_km: number;
  km_after_target: number | null;
  data_quality: "complete" | "partial" | "no_data";
  missing_days: string[];
  earliest_snapshot_date: string | null;
}

export const listUnitsWithService = () => api.get<UnitWithService[]>("/maintenance/units");

export function createService(input: CreateServiceInput): Promise<ActionResult<ServiceRecord>> {
  return mutate(api.post<ServiceRecord>("/maintenance/services", input));
}

export function deleteService(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/maintenance/services/${id}`));
}

export function calibrateOdometer(input: {
  unit_id: string;
  odometer_baseline_km: number;
}): Promise<ActionResult<unknown>> {
  return mutate(api.post("/maintenance/calibrate", input));
}

/** Sinkron mileage semua unit — dipakai polling halaman Service. */
export const syncAllMileage = () => api.get<MileageBatchResponse>("/maintenance/mileage");

/** Sinkron odometer terakhir (menu Service / dashboard) — dibagi supaya tidak dobel. */
let sinkronTerakhir = 0;
const JEDA_SINKRON_MS = 5 * 60_000;

/**
 * Sinkron odometer GPS, paling sering sekali tiap 5 menit untuk seluruh
 * aplikasi. Setelah sinkron, data dashboard disegarkan supaya angka service
 * di "Perlu tindakan" sama dengan menu Service. null = dilewati (baru saja sinkron).
 */
export async function sinkronOdometer(paksa = false): Promise<MileageBatchResponse | null> {
  if (!paksa && Date.now() - sinkronTerakhir < JEDA_SINKRON_MS) return null;
  sinkronTerakhir = Date.now();
  const hasil = await syncAllMileage();
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  return hasil;
}

export const syncUnitMileage = (unitId: string) =>
  api.post<SyncMileageResponse>(`/maintenance/units/${unitId}/sync-mileage`);

export const mileageAt = (unitId: string, date: string) =>
  api.get<MileageAtResponse>(`/maintenance/units/${unitId}/mileage-at`, { date });

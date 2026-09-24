import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, Driver } from "@/types";

export interface DriverInput {
  /** Driver dipilih dari data karyawan; nama driver mengikuti karyawan. */
  karyawan_id: string;
  no_hp: string;
  no_sim?: string | null;
  sim_berlaku_sampai?: string | null;
  alamat?: string | null;
  catatan?: string | null;
}

export const listDrivers = (includeInactive = false, onlyStandBy = false) =>
  api.get<Driver[]>("/drivers", { include_inactive: includeInactive, only_stand_by: onlyStandBy });

/** Karyawan aktif untuk dropdown nama driver. `driver_id` terisi bila sudah jadi driver. */
export interface KaryawanDriverOption {
  id: string;
  nama: string;
  driver_id: string | null;
}

export const listKaryawanDriver = () => api.get<KaryawanDriverOption[]>("/drivers/karyawan-pilihan");

export const getDriver = (id: string) => api.get<Driver>(`/drivers/${id}`);

export function createDriver(input: DriverInput): Promise<ActionResult<Driver>> {
  return mutate(api.post<Driver>("/drivers", input));
}

export function updateDriver(id: string, input: Partial<DriverInput>): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/drivers/${id}`, input));
}

export function deactivateDriver(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/drivers/${id}/deactivate`));
}

export function setDriverPin(id: string, pin: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/drivers/${id}/pin`, { pin }));
}

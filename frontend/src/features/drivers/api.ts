import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, Driver } from "@/types";

export interface DriverInput {
  nama: string;
  no_hp: string;
  no_sim?: string | null;
  sim_berlaku_sampai?: string | null;
  alamat?: string | null;
  catatan?: string | null;
}

export const listDrivers = (includeInactive = false, onlyStandBy = false) =>
  api.get<Driver[]>("/drivers", { include_inactive: includeInactive, only_stand_by: onlyStandBy });

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

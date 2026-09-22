import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, JenisUnit, UserRow } from "@/types";

// ── Jenis unit ──────────────────────────────────────────────────────────────

export const listJenisUnit = () => api.get<JenisUnit[]>("/jenis-unit");

export function createJenisUnit(nama: string): Promise<ActionResult<JenisUnit>> {
  return mutate(api.post<JenisUnit>("/jenis-unit", { nama }));
}

export function updateJenisUnit(id: string, nama: string): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/jenis-unit/${id}`, { nama }));
}

export function deleteJenisUnit(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/jenis-unit/${id}`));
}

// ── Pengguna (owner) ────────────────────────────────────────────────────────

export const listUsers = () => api.get<UserRow[]>("/users");

export function updateUserRole(input: {
  user_id: string;
  role: "owner" | "operator";
  allowed_jenis_unit_ids: string[];
}): Promise<ActionResult<unknown>> {
  return mutate(
    api.patch(`/users/${input.user_id}/role`, {
      role: input.role,
      allowed_jenis_unit_ids: input.allowed_jenis_unit_ids
    })
  );
}

export function setUserActive(input: {
  user_id: string;
  is_active: boolean;
}): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/users/${input.user_id}/active`, { is_active: input.is_active }));
}

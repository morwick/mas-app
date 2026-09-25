import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, JenisUnit, KaryawanOption, UserRow } from "@/types";

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

// ── Pengguna (superadmin) ───────────────────────────────────────────────────

export const listUsers = () => api.get<UserRow[]>("/users");

/** Semua karyawan beserta akun yang sudah dimilikinya (pilihan nama pengguna). */
export const listKaryawanTersedia = () => api.get<KaryawanOption[]>("/users/karyawan-tersedia");

export function createUser(input: {
  karyawan_id: string;
  email: string;
  password: string;
  roles: ("superadmin" | "operator" | "finance" | "admin")[];
  allowed_jenis_unit_ids: string[];
}): Promise<ActionResult<UserRow>> {
  return mutate(api.post<UserRow>("/users", input));
}

export function resetUserPassword(input: {
  user_id: string;
  password: string;
}): Promise<ActionResult<unknown>> {
  return mutate(
    api.post(`/users/${input.user_id}/reset-password`, { password: input.password })
  );
}

export function updateUser(input: {
  user_id: string;
  karyawan_id: string;
  email: string;
  roles: ("superadmin" | "operator" | "finance" | "admin")[];
  allowed_jenis_unit_ids: string[];
}): Promise<ActionResult<unknown>> {
  const { user_id, ...body } = input;
  return mutate(api.patch(`/users/${user_id}`, body));
}

export function setUserActive(input: {
  user_id: string;
  is_active: boolean;
}): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/users/${input.user_id}/active`, { is_active: input.is_active }));
}

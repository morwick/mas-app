import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, BiayaLain, JenisBiaya } from "@/types";

// ── Master jenis biaya ──────────────────────────────────────────────────────
export const listJenisBiaya = () => api.get<JenisBiaya[]>("/jenis-biaya");

export function createJenisBiaya(nama: string): Promise<ActionResult<JenisBiaya>> {
  return mutate(api.post<JenisBiaya>("/jenis-biaya", { nama }));
}

export function updateJenisBiaya(id: string, nama: string): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/jenis-biaya/${id}`, { nama }));
}

export function deleteJenisBiaya(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/jenis-biaya/${id}`));
}

// ── Biaya lain per job ──────────────────────────────────────────────────────
export interface BiayaLainInput {
  /** Pilihan dari daftar … */
  jenis_biaya_id: string | null;
  /** … atau jenis baru yang diketik (dibuat bersama biaya ini). */
  jenis_biaya_nama: string | null;
  nominal: number;
  catatan: string | null;
}

export const listBiayaLainJob = (jobId: string) => api.get<BiayaLain[]>(`/jobs/${jobId}/biaya-lain`);

/** Kunci query daftar biaya lain job — ditunggu segar setelah simpan/hapus. */
export const kunciBiayaLainJob = (jobId: string) => ["biaya-lain", "job", jobId];

export function createBiayaLain(jobId: string, input: BiayaLainInput): Promise<ActionResult<BiayaLain>> {
  return mutate(api.post<BiayaLain>("/biaya-lain", { job_id: jobId, ...input }), {
    tungguKunci: [kunciBiayaLainJob(jobId)]
  });
}

export function updateBiayaLain(jobId: string, id: string, input: BiayaLainInput): Promise<ActionResult<BiayaLain>> {
  return mutate(api.patch<BiayaLain>(`/biaya-lain/${id}`, input), { tungguKunci: [kunciBiayaLainJob(jobId)] });
}

export function deleteBiayaLain(jobId: string, id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/biaya-lain/${id}`), { tungguKunci: [kunciBiayaLainJob(jobId)] });
}

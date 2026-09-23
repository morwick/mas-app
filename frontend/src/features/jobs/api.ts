import { ApiError, api } from "@/lib/api/client";
import { mutate, queryClient } from "@/lib/api/query";
import type { ConflictCheckResult } from "@/lib/job-conflicts";
import type {
  ActionResult,
  Job,
  JobPhoto,
  JobStatus,
  JobStatusHistoryEntry,
  PhotoSlot,
  PhotoStage
} from "@/types";

export interface JobInput {
  customer_id: string;
  /** PIC di lapangan — wajib; backend menolak nilai kosong. */
  pic_nama: string;
  pic_no_hp: string;
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  asal_lat?: number | null;
  asal_lng?: number | null;
  tujuan_lat?: number | null;
  tujuan_lng?: number | null;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta?: string | null;
  /** BR-04: pagu uang jalan, wajib saat membuat job. */
  uang_jalan_pagu?: number;
  catatan?: string | null;
  /** Diisi bila job lahir dari penawaran yang sudah deal. */
  quotation_id?: string | null;
}

export interface MutationOptions {
  /** True bila admin sudah konfirmasi tetap simpan meski ada bentrok. */
  allowConflict?: boolean;
}

/** Hasil mutasi job — membawa `conflicts` saat server menolak karena bentrok (409). */
export type JobMutationResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; conflicts?: ConflictCheckResult };

export interface ActiveJobByUnit {
  unit_id: string;
  job: Job;
}

export type JobListFilter = "active" | "menunggu_validasi" | "selesai" | "cancelled" | "all";

export const listJobs = (opts?: { status?: JobListFilter; customerId?: string }) =>
  api.get<Job[]>("/jobs", { status: opts?.status ?? "all", customer_id: opts?.customerId });

export const getJob = (id: string) => api.get<Job>(`/jobs/${id}`);
export const getJobHistory = (id: string) => api.get<JobStatusHistoryEntry[]>(`/jobs/${id}/history`);
export const activeJobsByUnit = () => api.get<ActiveJobByUnit[]>("/jobs/active-by-unit");
export const jobsInRange = (start: string, end: string) =>
  api.get<Job[]>("/jobs/schedule", { start, end });

export const checkJobConflicts = (input: {
  unit_id: string;
  driver_id: string;
  etd: string;
  eta?: string | null;
  exclude_job_id?: string;
}) => api.post<ConflictCheckResult>("/jobs/check-conflicts", input);

/** Server membalas 409 + `conflicts` bila jadwal bentrok dan allowConflict false. */
function toJobResult<T>(err: unknown): JobMutationResult<T> {
  if (err instanceof ApiError && err.status === 409 && err.body.conflicts) {
    const raw = err.body.conflicts as {
      unit: ConflictCheckResult["unit"];
      driver: ConflictCheckResult["driver"];
      has_any: boolean;
    };
    return {
      ok: false,
      error: err.message,
      conflicts: { unit: raw.unit, driver: raw.driver, hasAny: raw.has_any }
    };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Terjadi kesalahan" };
}

export async function createJob(
  input: JobInput,
  opts?: MutationOptions
): Promise<JobMutationResult<{ id: string; job_number: string; share_token: string }>> {
  try {
    const data = await api.post<{ id: string; job_number: string; share_token: string }>("/jobs", {
      ...input,
      allow_conflict: !!opts?.allowConflict
    });
    await queryClient.invalidateQueries();
    return { ok: true, data };
  } catch (err) {
    return toJobResult(err);
  }
}

export async function updateJob(
  id: string,
  input: Partial<JobInput>,
  opts?: MutationOptions
): Promise<JobMutationResult> {
  try {
    await api.patch(`/jobs/${id}`, { ...input, allow_conflict: !!opts?.allowConflict });
    await queryClient.invalidateQueries();
    return { ok: true, data: undefined };
  } catch (err) {
    return toJobResult(err);
  }
}

/** Fase 7: Approve — job selesai, driver kembali Stand By. */
export function validateJob(id: string): Promise<ActionResult<{ status: JobStatus }>> {
  return mutate(api.post<{ status: JobStatus }>(`/jobs/${id}/validate`));
}

/** Fase 7: kembalikan ke driver dengan catatan perbaikan. */
export function returnJob(
  id: string,
  note: string,
  toStatus: "loading" | "dalam_perjalanan" | "unloading" | "serah_terima_pool" = "serah_terima_pool"
): Promise<ActionResult<{ status: JobStatus }>> {
  return mutate(api.post<{ status: JobStatus }>(`/jobs/${id}/return`, { note, to_status: toStatus }));
}

export function updateJobStatus(
  id: string,
  status: JobStatus,
  notes?: string
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/jobs/${id}/status`, { status, notes: notes ?? null }));
}

export function cancelJob(id: string, reason?: string): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/jobs/${id}/cancel`, { reason: reason ?? null }));
}

/** Foto job diunggah lewat backend (yang meneruskan ke Supabase Storage). */
export function uploadJobPhoto(
  jobId: string,
  stage: PhotoStage,
  file: Blob,
  fileName = "foto.jpg",
  slot?: PhotoSlot
): Promise<ActionResult<JobPhoto>> {
  const form = new FormData();
  form.append("type", stage);
  if (slot) form.append("slot", slot);
  form.append("photo", file, fileName);
  return mutate(api.upload<JobPhoto>(`/jobs/${jobId}/photos`, form));
}

export function deleteJobPhoto(jobId: string, photoId: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/jobs/${jobId}/photos/${photoId}`));
}

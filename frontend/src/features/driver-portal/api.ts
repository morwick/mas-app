import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  Job,
  JobPhoto,
  JobStatus,
  PhotoSlot,
  PhotoStage,
  UangJalan,
  UangJalanPosisi,
  UangJalanRequest,
  UangJalanRingkasan
} from "@/types";

export type DriverJobFilter = "active" | "all" | "konfirmasi" | "aktif" | "selesai";

export const myJobs = (status: DriverJobFilter = "all") =>
  api.get<Job[]>("/driver/jobs", { status }, "driver");

export const myJob = (id: string) => api.get<Job>(`/driver/jobs/${id}`, undefined, "driver");

export function driverAcceptJob(
  jobId: string
): Promise<ActionResult<{ accepted_at: string; status: JobStatus }>> {
  return mutate(
    api.post<{ accepted_at: string; status: JobStatus }>(`/driver/jobs/${jobId}/accept`, undefined, "driver")
  );
}

export function driverUpdateJobStatus(
  jobId: string,
  nextStatus: JobStatus,
  notes?: string
): Promise<ActionResult<{ status: JobStatus }>> {
  return mutate(
    api.post<{ status: JobStatus }>(
      `/driver/jobs/${jobId}/status`,
      { status: nextStatus, notes: notes ?? null },
      "driver"
    )
  );
}

export interface DriverUangJalan {
  transaksi: UangJalan[];
  ringkasan: UangJalanRingkasan;
  pengajuan: UangJalanRequest[];
  posisi: UangJalanPosisi | null;
}

export const driverUangJalan = (jobId: string) =>
  api.get<DriverUangJalan>(`/driver/jobs/${jobId}/uang-jalan`, undefined, "driver");

/** BR-05: ajukan uang jalan (nominal ≤ sisa pagu). */
export function driverRequestUangJalan(
  jobId: string,
  nominal: number,
  catatan?: string | null
): Promise<ActionResult<UangJalanRequest>> {
  return mutate(
    api.post<UangJalanRequest>(
      `/driver/jobs/${jobId}/uang-jalan/ajukan`,
      { nominal, catatan: catatan ?? null },
      "driver"
    )
  );
}

/** Unggah/ganti foto pada satu slot tahap (FR-PHOTO-01..06). */
export function driverUploadPhoto(
  jobId: string,
  stage: PhotoStage,
  slot: PhotoSlot,
  file: Blob,
  opts?: { fileName?: string; takenAt?: string; lat?: number; lng?: number }
): Promise<ActionResult<JobPhoto>> {
  const form = new FormData();
  form.append("stage", stage);
  form.append("slot", slot);
  form.append("photo", file, opts?.fileName ?? "foto.jpg");
  if (opts?.takenAt) form.append("taken_at", opts.takenAt);
  if (opts?.lat != null) form.append("lat", String(opts.lat));
  if (opts?.lng != null) form.append("lng", String(opts.lng));
  return mutate(api.upload<JobPhoto>(`/driver/jobs/${jobId}/photos`, form, "driver"));
}

export interface DriverNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  job_id: string | null;
  read_at: string | null;
  created_at: string;
}

export const driverNotifications = () =>
  api.get<DriverNotification[]>("/driver/notifications", undefined, "driver");

export const driverMarkRead = (ids: string[]) =>
  api.post("/driver/notifications/read", { ids }, "driver");

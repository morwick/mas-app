import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult, Job, JobPhoto, JobStatus } from "@/types";

export const myJobs = (status: "active" | "all" = "all") =>
  api.get<Job[]>("/driver/jobs", { status }, "driver");

export const myJob = (id: string) => api.get<Job>(`/driver/jobs/${id}`, undefined, "driver");

export function driverAcceptJob(jobId: string): Promise<ActionResult<{ accepted_at: string }>> {
  return mutate(
    api.post<{ accepted_at: string }>(`/driver/jobs/${jobId}/accept`, undefined, "driver")
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

export function driverSubmitPod(input: {
  jobId: string;
  penerima_nama: string;
  penerima_jabatan?: string | null;
  catatan?: string | null;
  /** PNG data URL dari kanvas tanda tangan. */
  signature_data_url?: string | null;
}): Promise<ActionResult<unknown>> {
  const { jobId, ...body } = input;
  return mutate(api.post(`/driver/jobs/${jobId}/pod`, body, "driver"));
}

export function driverUploadPhoto(
  jobId: string,
  type: "loading" | "unloading",
  file: Blob,
  fileName = "foto.jpg"
): Promise<ActionResult<JobPhoto>> {
  const form = new FormData();
  form.append("type", type);
  form.append("photo", file, fileName);
  return mutate(api.upload<JobPhoto>(`/driver/jobs/${jobId}/photos`, form, "driver"));
}

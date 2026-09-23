import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  SumberDana,
  UangJalan,
  UangJalanJenis,
  UangJalanJobRow,
  UangJalanPosisi,
  UangJalanRequest,
  UangJalanRingkasan
} from "@/types";

export interface UangJalanInput {
  job_id: string;
  jenis: UangJalanJenis;
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  keperluan?: string | null;
  catatan?: string | null;
}

export interface JobUangJalan {
  transaksi: UangJalan[];
  ringkasan: UangJalanRingkasan;
  pengajuan: UangJalanRequest[];
  posisi: UangJalanPosisi | null;
}

export const listSumberDana = () => api.get<SumberDana[]>("/sumber-dana");
export const listJobUangJalan = () => api.get<UangJalanJobRow[]>("/uang-jalan");
export const jobUangJalan = (jobId: string) => api.get<JobUangJalan>(`/jobs/${jobId}/uang-jalan`);

export function createUangJalan(input: UangJalanInput): Promise<ActionResult<UangJalan>> {
  return mutate(api.post<UangJalan>("/uang-jalan", input));
}

/** Fase 3: pencairan oleh kasir — wajib foto bukti transfer (FR-UJ-06). */
export function createPencairan(
  input: Omit<UangJalanInput, "jenis"> & { sumber_dana_id: string; request_id?: string | null },
  bukti: File
): Promise<ActionResult<UangJalan>> {
  const form = new FormData();
  form.append("job_id", input.job_id);
  form.append("tanggal", input.tanggal);
  form.append("jumlah", String(input.jumlah));
  form.append("sumber_dana_id", input.sumber_dana_id);
  if (input.keperluan) form.append("keperluan", input.keperluan);
  if (input.catatan) form.append("catatan", input.catatan);
  if (input.request_id) form.append("request_id", input.request_id);
  form.append("bukti", bukti, bukti.name);
  return mutate(api.upload<UangJalan>("/uang-jalan/pencairan", form));
}

export const listPendingRequests = () => api.get<UangJalanRequest[]>("/uang-jalan/pengajuan");

export function rejectRequest(
  requestId: string,
  alasan?: string | null
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/uang-jalan/pengajuan/${requestId}/tolak`, { alasan: alasan ?? null }));
}

export function updateUangJalan(id: string, input: UangJalanInput): Promise<ActionResult<unknown>> {
  return mutate(api.put(`/uang-jalan/${id}`, input));
}

export function deleteUangJalan(id: string, _jobId?: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/uang-jalan/${id}`));
}

export function setPagu(jobId: string, pagu: number): Promise<ActionResult<unknown>> {
  return mutate(api.put(`/jobs/${jobId}/uang-jalan/pagu`, { pagu }));
}

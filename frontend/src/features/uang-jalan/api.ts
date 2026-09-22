import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type {
  ActionResult,
  SumberDana,
  UangJalan,
  UangJalanJenis,
  UangJalanJobRow,
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
}

export const listSumberDana = () => api.get<SumberDana[]>("/sumber-dana");
export const listJobUangJalan = () => api.get<UangJalanJobRow[]>("/uang-jalan");
export const jobUangJalan = (jobId: string) => api.get<JobUangJalan>(`/jobs/${jobId}/uang-jalan`);

export function createUangJalan(input: UangJalanInput): Promise<ActionResult<UangJalan>> {
  return mutate(api.post<UangJalan>("/uang-jalan", input));
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

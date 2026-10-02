import { ApiError, api } from "@/lib/api/client";
import { mutate, queryClient } from "@/lib/api/query";
import { localInputToIso } from "@/lib/utils";
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

/** Isian job. Customer, PIC lapangan, dan No HP PIC milik proyek. */
export interface JobInput {
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  asal_lat?: number | null;
  asal_lng?: number | null;
  tujuan_lat?: number | null;
  tujuan_lng?: number | null;
  unit_id: string;
  /** Wajib bila jenis unit dari unit-nya punya jenis unit trailer; null bila tidak. */
  unit_trailer_id?: string | null;
  driver_id: string;
  etd: string;
  eta?: string | null;
  /** BR-04: uang jalan awal, wajib saat membuat job. */
  uang_jalan_awal?: number;
  catatan?: string | null;
  /** Diisi bila job lahir dari penawaran yang sudah deal. */
  quotation_id?: string | null;
  quotation_item_id?: string | null;
  /** Wajib saat menambah job ke proyek yang sudah ada (POST /jobs). */
  proyek_id?: string | null;
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
}) => api.post<ConflictCheckResult>("/jobs/check-conflicts", jadwalKeIso(input));

/**
 * Server membalas 409 + `conflicts` bila jadwal bentrok — job tidak disimpan.
 * Daftar job disegarkan supaya peringatan bentrok di form ikut muncul bila
 * datanya tadi sudah basi.
 */
export function toJobResult<T>(err: unknown): JobMutationResult<T> {
  if (err instanceof ApiError && err.status === 409 && err.body.conflicts) {
    void queryClient.invalidateQueries({ queryKey: ["jobs"] });
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

/** ETD/ETA dari input datetime-local dikirim lengkap dengan zona waktunya. */
function jadwalKeIso<T extends Partial<Pick<JobInput, "etd" | "eta">>>(input: T): T {
  return {
    ...input,
    ...(input.etd ? { etd: localInputToIso(input.etd) } : {}),
    ...(input.eta ? { eta: localInputToIso(input.eta) } : {})
  };
}

export async function createJob(
  input: JobInput
): Promise<JobMutationResult<{ id: string; job_number: string; share_token: string }>> {
  try {
    const data = await api.post<{ id: string; job_number: string; share_token: string }>(
      "/jobs",
      jadwalKeIso(input)
    );
    // Sengaja tidak di-await: form langsung pindah halaman. Bila ditunggu, daftar
    // job aktif sudah memuat job yang baru tersimpan sementara form masih tampil,
    // sehingga form mengira isiannya bentrok dengan job itu sendiri.
    void queryClient.invalidateQueries();
    return { ok: true, data };
  } catch (err) {
    return toJobResult(err);
  }
}

export async function updateJob(id: string, input: Partial<JobInput>): Promise<JobMutationResult> {
  try {
    await api.patch(`/jobs/${id}`, jadwalKeIso(input));
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

/** Satu baris riwayat penggantian di job (driver / unit trailer / unit). */
export interface GantiTrukEntry {
  id: string;
  /** ganti_truk (riwayat lama) | ganti_driver | ganti_trailer | ganti_unit */
  jenis: "ganti_truk" | "ganti_driver" | "ganti_trailer" | "ganti_unit";
  diganti_pada: string;
  status_job_saat_ganti: string;
  alasan: string;
  unit_lama_kode: string | null;
  unit_baru_kode: string | null;
  driver_lama_nama: string | null;
  driver_baru_nama: string | null;
  unit_trailer_lama_kode: string | null;
  unit_trailer_baru_kode: string | null;
  diganti_oleh_nama: string | null;
  uang_jalan_dikembalikan: number;
  kasbon: number;
  /** Ganti unit: job pengganti yang dibuat. */
  job_pengganti_id: string | null;
  job_pengganti_number: string | null;
  /** Status job pengganti (cancelled → bisa "Selesaikan job dengan unit lain"). */
  job_pengganti_status?: string | null;
}

export const getRiwayatGantiTruk = (id: string) => api.get<GantiTrukEntry[]>(`/jobs/${id}/ganti-truk`);

/** Uang jalan di tangan supir lama: dikembalikan ke kas dan/atau jadi kasbon. */
export interface PengembalianKasbon {
  uang_jalan_dikembalikan: number;
  /** Kas penerima — wajib bila ada pengembalian. */
  sumber_dana_id: string | null;
  kasbon: number;
}

export interface InsidenPenggantian {
  insiden_tanggal: string;
  insiden_lokasi?: string | null;
  insiden_deskripsi: string;
}

/** Driver sakit / kabur: ganti driver di job yang sama. */
export function gantiDriver(
  id: string,
  input: PengembalianKasbon & { driver_id: string; alasan: string }
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/jobs/${id}/ganti-driver`, input));
}

/** Unit trailer rusak: ganti trailer di job yang sama. */
export function gantiTrailer(
  id: string,
  input: InsidenPenggantian & { unit_trailer_id: string; alasan: string }
): Promise<ActionResult<unknown>> {
  return mutate(api.post(`/jobs/${id}/ganti-trailer`, input));
}

/** Unit rusak: job pengganti di proyek yang sama; job lama ditutup Selesai. */
export function gantiUnit(
  id: string,
  input: InsidenPenggantian &
    PengembalianKasbon & {
      unit_id: string;
      driver_id: string;
      unit_trailer_id: string | null;
      etd: string;
      eta: string | null;
      uang_jalan_awal: number;
      alasan: string;
    }
): Promise<ActionResult<{ id: string; job_number: string; share_token: string }>> {
  return mutate(
    api.post<{ id: string; job_number: string; share_token: string }>(`/jobs/${id}/ganti-unit`, {
      ...input,
      etd: localInputToIso(input.etd),
      eta: input.eta ? localInputToIso(input.eta) : null
    })
  );
}

/**
 * Job pengganti (ganti unit) dibatalkan → buat pengganti baru untuk job lama
 * `id`. Job pengganti yang dibatalkan dihapus (soft delete) oleh database.
 */
export function gantiUnitUlang(
  id: string,
  input: {
    unit_id: string;
    driver_id: string;
    unit_trailer_id: string | null;
    etd: string;
    eta: string | null;
    uang_jalan_awal: number;
    alasan: string;
  }
): Promise<ActionResult<{ id: string; job_number: string; share_token: string }>> {
  return mutate(
    api.post<{ id: string; job_number: string; share_token: string }>(`/jobs/${id}/ganti-unit-ulang`, {
      ...input,
      etd: localInputToIso(input.etd),
      eta: input.eta ? localInputToIso(input.eta) : null
    })
  );
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

export interface EstimasiRute {
  distance_km: number;
  duration_min: number;
  /** False bila rute truk tidak ditemukan dan durasi dari profil mobil. */
  truk: boolean;
  /** Penyeberangan kapal ferry — sudah termasuk di jarak & durasi total. */
  laut: SegmenLaut[];
}

export interface SegmenLaut {
  /** Nama lintasan dari data peta, mis. "Surabaya - Banjarmasin"; bisa kosong. */
  nama: string | null;
  distance_km: number;
  duration_min: number;
}

/** Jarak & durasi perjalanan truk antara dua titik (OpenRouteService). */
export const estimasiRute = (asal: { lat: number; lng: number }, tujuan: { lat: number; lng: number }) =>
  api.get<EstimasiRute>("/geo/estimasi-rute", {
    asal_lat: asal.lat,
    asal_lng: asal.lng,
    tujuan_lat: tujuan.lat,
    tujuan_lng: tujuan.lng
  });

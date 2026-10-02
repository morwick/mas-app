import { api } from "@/lib/api/client";
import { queryClient } from "@/lib/api/query";
import { localInputToIso } from "@/lib/utils";
import type { JobInput, JobMutationResult } from "@/features/jobs/api";
import { toJobResult } from "@/features/jobs/api";
import type { ProyekDetail, ProyekRingkas } from "@/types";

/** Filter "status tagih" di Tab Proyek. */
export type StatusTagih = "belum" | "sudah";

/** Filter status proyek; "batal" = semua job proyek dibatalkan. */
export type StatusProyek = "aktif" | "batal";

/** Nilai khusus filter customer: hanya proyek tanpa customer (kosongan). */
export const FILTER_TANPA_CUSTOMER = "__tanpa_customer__";

export interface ProyekPage {
  items: ProyekRingkas[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProyekFilter {
  page: number;
  pageSize: number;
  q: string;
  /** Id customer, FILTER_TANPA_CUSTOMER, atau "" = semua. */
  customerId: string;
  /** 1–12; 0 = semua bulan. */
  bulan: number;
  /** 0 = semua tahun. */
  tahun: number;
  statusTagih: StatusTagih | "";
  /** "" = semua proyek. */
  statusProyek: StatusProyek | "";
}

/** Paging, pencarian, dan filter dijalankan di server (LIMIT/OFFSET). */
export const listProyek = (f: ProyekFilter) => {
  const tanpaCustomer = f.customerId === FILTER_TANPA_CUSTOMER;
  return api.get<ProyekPage>("/proyek/page", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    customer_id: tanpaCustomer ? undefined : f.customerId || undefined,
    tanpa_customer: tanpaCustomer || undefined,
    bulan: f.bulan || undefined,
    tahun: f.tahun || undefined,
    status_tagih: f.statusTagih || undefined,
    status_proyek: f.statusProyek || undefined
  });
};

/** Satu job yang memakai sebuah unit (Tab Proyek per unit). */
export interface JobUnitBaris {
  job_id: string;
  job_number: string;
  proyek_id: string;
  nomor_proyek: string;
  /** Kosong = proyek tanpa customer (kosongan). */
  customer_nama: string | null;
  /** Asal & tujuan — kolom Rute (sama dengan daftar Job). */
  asal?: string | null;
  tujuan: string | null;
  /** ETD — acuan bila belum muat. */
  etd: string | null;
  tanggal_muat: string | null;
  tanggal_bongkar: string | null;
  /** Job dibatalkan. */
  dibatalkan: boolean;
}

/** Unit + job-job yang memakainya (hanya unit yang punya job di periode itu). */
export interface ProyekPerUnit {
  unit_id: string;
  kode_unit: string;
  no_polisi: string | null;
  jenis_unit_nama: string | null;
  jobs: JobUnitBaris[];
}

export interface ProyekPerUnitFilter {
  page: number;
  pageSize: number;
  q: string;
  /** 1–12; 0 = semua bulan. */
  bulan: number;
  /** 0 = semua tahun. */
  tahun: number;
  /** "" = semua proyek. */
  statusProyek: StatusProyek | "";
}

/** Paging per unit, pencarian, & filter dijalankan di server (LIMIT/OFFSET). */
export const listProyekPerUnit = (f: ProyekPerUnitFilter) =>
  api.get<{ items: ProyekPerUnit[]; total: number; page: number; page_size: number }>("/proyek/per-unit", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    bulan: f.bulan || undefined,
    tahun: f.tahun || undefined,
    status_proyek: f.statusProyek || undefined
  });

export const getProyek = (id: string) => api.get<ProyekDetail>(`/proyek/${id}`);

/** Customer (boleh kosong: unit jalan kosongan) & PIC lapangan proyek. */
export interface ProyekKlien {
  customer_id: string | null;
  pic_nama: string | null;
  pic_no_hp: string | null;
}

interface JobBaru {
  id: string;
  job_number: string;
  share_token: string;
}

export interface ProyekCreated {
  id: string;
  nomor_proyek: string;
  jobs: JobBaru[];
}

/** ETD/ETA dari input datetime-local dikirim lengkap dengan zona waktunya. */
function jadwalKeIso(job: JobInput): JobInput {
  return {
    ...job,
    etd: localInputToIso(job.etd),
    ...(job.eta ? { eta: localInputToIso(job.eta) } : {})
  };
}

/**
 * Proyek baru + semua jobnya — disimpan server dalam SATU transaksi (gagal
 * salah satu = tidak ada yang tersimpan). Bentrok jadwal dibalas 409 +
 * `conflicts`, sama seperti membuat job.
 */
export async function createProyek(
  input: ProyekKlien & { jobs: JobInput[] }
): Promise<JobMutationResult<ProyekCreated>> {
  try {
    const data = await api.post<ProyekCreated>("/proyek", { ...input, jobs: input.jobs.map(jadwalKeIso) });
    // Tidak di-await — form langsung pindah halaman (lihat createJob).
    void queryClient.invalidateQueries();
    return { ok: true, data };
  } catch (err) {
    return toJobResult(err);
  }
}

/** Ubah customer/PIC proyek + tambah job baru — satu transaksi di server. */
export async function updateProyek(
  id: string,
  input: ProyekKlien & { jobs_baru: JobInput[] }
): Promise<JobMutationResult<{ jobs_baru: JobBaru[] }>> {
  try {
    const data = await api.patch<{ jobs_baru: JobBaru[] }>(`/proyek/${id}`, {
      ...input,
      jobs_baru: input.jobs_baru.map(jadwalKeIso)
    });
    void queryClient.invalidateQueries();
    return { ok: true, data };
  } catch (err) {
    return toJobResult(err);
  }
}

/** Proyek dari penawaran & unit yang sama — tujuan tombol "Gabung Proyek". */
export const cariProyekPenawaran = (quotationId: string, unitId: string) =>
  api.get<{ id: string; nomor_proyek: string } | null>("/proyek/cari", { quotation_id: quotationId, unit_id: unitId });

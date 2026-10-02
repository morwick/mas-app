/**
 * Isian satu job baru di form proyek (satu item accordion). Customer, PIC
 * lapangan, dan No HP PIC milik proyek — tidak ada di sini.
 */

import type { JobInput } from "@/features/jobs/api";
import { ETA_TIDAK_TERHITUNG_MESSAGE } from "@/features/jobs/components/estimasi-rute";
import { validateSchedule } from "@/lib/job-schedule";
import { localInputToIso } from "@/lib/utils";
import type { Job } from "@/types";

export interface JobDraft {
  /** Kunci lokal item accordion (bukan id database). */
  key: string;
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  asal_lat: number | null;
  asal_lng: number | null;
  tujuan_lat: number | null;
  tujuan_lng: number | null;
  unit_id: string;
  unit_trailer_id: string;
  driver_id: string;
  etd: string;
  eta: string;
  /** BR-04: uang jalan sudah diketahui sejak awal — wajib. */
  uang_jalan_awal: string;
  catatan: string;
  /** Diisi bila job lahir dari item penawaran yang deal. */
  quotation_id: string | null;
  quotation_item_id: string | null;
}

/** Keadaan yang dihitung komponen job (data unit trailer & estimasi rute). */
export interface JobDraftMeta {
  trailerWajib: boolean;
  trailerPending: boolean;
  /** ETA kosong tapi sistem tidak bisa menghitungnya dari rute. */
  etaTidakTerhitung: boolean;
  /** Kode unit trailer yang dipilih — untuk halaman review. */
  trailerKode: string | null;
}

export const META_AWAL: JobDraftMeta = {
  trailerWajib: false,
  trailerPending: false,
  etaTidakTerhitung: false,
  trailerKode: null
};

let urutKey = 0;

export function jobDraftBaru(isi?: Partial<JobDraft>): JobDraft {
  urutKey += 1;
  return {
    key: `job-${Date.now()}-${urutKey}`,
    alat_diangkut: "",
    asal: "",
    tujuan: "",
    asal_lat: null,
    asal_lng: null,
    tujuan_lat: null,
    tujuan_lng: null,
    unit_id: "",
    unit_trailer_id: "",
    driver_id: "",
    etd: "",
    eta: "",
    uang_jalan_awal: "",
    catatan: "",
    quotation_id: null,
    quotation_item_id: null,
    ...isi
  };
}

/** Field → bagian accordion tempatnya, supaya bagian yang salah bisa dibuka. */
export type BagianJob = "pengiriman" | "unit" | "catatan";
const BAGIAN_FIELD: Record<string, BagianJob> = {
  alat_diangkut: "pengiriman",
  asal: "pengiriman",
  tujuan: "pengiriman",
  unit_id: "unit",
  unit_trailer_id: "unit",
  driver_id: "unit",
  etd: "unit",
  eta: "unit",
  uang_jalan_awal: "unit"
};

export function bagianDariField(field: string): BagianJob {
  return BAGIAN_FIELD[field] ?? "catatan";
}

export function bagianDariError(errors: Record<string, string>): BagianJob[] {
  return [...new Set(Object.keys(errors).map(bagianDariField))];
}

/** Validasi isian satu job — aturan yang sama dengan form job sebelumnya. */
export function validasiJob(d: JobDraft, meta: JobDraftMeta): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!d.alat_diangkut.trim()) errs.alat_diangkut = "Alat wajib diisi";
  // Lokasi wajib dipin di peta supaya koordinatnya ikut tersimpan; alamat di
  // kotak teks tetap boleh dikoreksi setelah dipin.
  if (d.asal_lat === null || d.asal_lng === null) errs.asal = "Pin lokasi asal di peta";
  else if (!d.asal.trim()) errs.asal = "Alamat lokasi asal wajib diisi";
  if (d.tujuan_lat === null || d.tujuan_lng === null) errs.tujuan = "Pin lokasi tujuan di peta";
  else if (!d.tujuan.trim()) errs.tujuan = "Alamat lokasi tujuan wajib diisi";
  if (!d.unit_id) errs.unit_id = "Unit wajib dipilih";
  else if (meta.trailerPending) errs.unit_trailer_id = "Tunggu, pilihan unit trailer sedang dimuat";
  else if (meta.trailerWajib && !d.unit_trailer_id) errs.unit_trailer_id = "Unit trailer wajib dipilih";
  if (!d.driver_id) errs.driver_id = "Driver wajib dipilih";
  if (!d.etd) errs.etd = "ETD wajib diisi";
  Object.assign(errs, validateSchedule(d.etd, d.eta));
  // ETA kosong hanya boleh bila sistem bisa menghitungnya dari rute.
  if (!d.eta && meta.etaTidakTerhitung) errs.eta = ETA_TIDAK_TERHITUNG_MESSAGE;
  if (!(Number(d.uang_jalan_awal) > 0)) errs.uang_jalan_awal = "Uang jalan wajib diisi";
  return errs;
}

export function keJobInput(d: JobDraft, meta: JobDraftMeta): JobInput {
  return {
    alat_diangkut: d.alat_diangkut,
    asal: d.asal,
    tujuan: d.tujuan,
    asal_lat: d.asal_lat,
    asal_lng: d.asal_lng,
    tujuan_lat: d.tujuan_lat,
    tujuan_lng: d.tujuan_lng,
    unit_id: d.unit_id,
    // Hanya dikirim bila unit ini memang memakai unit trailer.
    unit_trailer_id: meta.trailerWajib ? d.unit_trailer_id || null : null,
    driver_id: d.driver_id,
    etd: d.etd,
    eta: d.eta || null,
    uang_jalan_awal: Math.round(Number(d.uang_jalan_awal)),
    catatan: d.catatan,
    quotation_id: d.quotation_id,
    quotation_item_id: d.quotation_item_id
  };
}

/**
 * Job lain di form yang sama, dalam bentuk Job tiruan untuk pemeriksaan
 * bentrok: dua job baru dengan unit/driver sama di jam beririsan juga bentrok
 * (server memeriksa hal yang sama).
 */
export function draftSebagaiJob(d: JobDraft, nomor: number): Job | null {
  if (!d.unit_id || !d.driver_id || !d.etd) return null;
  return {
    id: d.key,
    job_number: `Job ${nomor} di form ini`,
    customer_nama: "",
    unit_id: d.unit_id,
    driver_id: d.driver_id,
    etd: localInputToIso(d.etd),
    eta: d.eta ? localInputToIso(d.eta) : null,
    status: "ditugaskan"
  } as Job;
}

/**
 * Metadata status job v2 (PRD-Alur-Kerja-Job-v2 §6) dan slot foto (BR-06).
 * Satu tempat supaya label, warna, dan urutan tahap tidak tersebar.
 */

import type { JobStatus, PhotoSlot, PhotoStage } from "@/types";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  menunggu_pickup: "Ditugaskan",
  ditugaskan: "Ditugaskan",
  diterima: "Diterima driver",
  loading: "Loading",
  dalam_perjalanan: "Dalam perjalanan",
  unloading: "Unloading",
  serah_terima_pool: "Serah terima pool",
  menunggu_validasi: "Menunggu validasi",
  selesai: "Selesai",
  cancelled: "Dibatalkan"
};

/** Kelas badge (lihat globals.css `.badge-*`). */
export const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  menunggu_pickup: "badge-pickup",
  ditugaskan: "badge-pickup",
  diterima: "badge-pickup",
  loading: "badge-loading",
  dalam_perjalanan: "badge-perjalanan",
  unloading: "badge-unloading",
  serah_terima_pool: "badge-unloading",
  menunggu_validasi: "badge-perbaikan",
  selesai: "badge-selesai",
  cancelled: "badge-cancelled"
};

export const JOB_STATUS_COLOR: Record<JobStatus, { bg: string; fg: string }> = {
  menunggu_pickup: { bg: "var(--status-pickup-bg)", fg: "var(--status-pickup-text)" },
  ditugaskan: { bg: "var(--status-pickup-bg)", fg: "var(--status-pickup-text)" },
  diterima: { bg: "var(--status-pickup-bg)", fg: "var(--status-pickup-text)" },
  loading: { bg: "#fff4e0", fg: "#8a5a00" },
  dalam_perjalanan: { bg: "var(--status-perjalanan-bg)", fg: "var(--status-perjalanan-text)" },
  unloading: { bg: "#efeafe", fg: "#4a2bb0" },
  serah_terima_pool: { bg: "#efeafe", fg: "#4a2bb0" },
  menunggu_validasi: { bg: "var(--status-perbaikan-bg)", fg: "var(--status-perbaikan-text)" },
  selesai: { bg: "var(--status-selesai-bg)", fg: "var(--status-selesai-text)" },
  cancelled: { bg: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-text)" }
};

/** Warna solid untuk papan jadwal. */
export const JOB_STATUS_SOLID: Record<JobStatus, string> = {
  menunggu_pickup: "#8A8A85",
  ditugaskan: "#8A8A85",
  diterima: "#1f4fa8",
  loading: "#c97900",
  dalam_perjalanan: "#1c9600",
  unloading: "#4a2bb0",
  serah_terima_pool: "#4a2bb0",
  menunggu_validasi: "#854f0b",
  selesai: "#145b00",
  cancelled: "#c93030"
};

/** Status yang masih menahan unit & driver (BR-01). */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "menunggu_pickup",
  "ditugaskan",
  "diterima",
  "loading",
  "dalam_perjalanan",
  "unloading",
  "serah_terima_pool",
  "menunggu_validasi"
];

export function isActiveStatus(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

/** Status yang bisa dilalui driver berikutnya (satu langkah maju). */
export const NEXT_DRIVER_STATUS: Partial<Record<JobStatus, JobStatus>> = {
  diterima: "loading",
  loading: "dalam_perjalanan",
  dalam_perjalanan: "unloading",
  unloading: "serah_terima_pool",
  serah_terima_pool: "menunggu_validasi"
};

/** Tahap yang ditampilkan ke pelanggan — proses internal (pool/validasi) disembunyikan. */
export const CUSTOMER_STEPS: Array<{ key: JobStatus; label: string }> = [
  { key: "ditugaskan", label: "Dijadwalkan" },
  { key: "loading", label: "Loading" },
  { key: "dalam_perjalanan", label: "Dalam perjalanan" },
  { key: "unloading", label: "Unloading" },
  { key: "selesai", label: "Selesai" }
];

/** Petakan status internal ke tahap pelanggan. */
export function customerStep(status: JobStatus): JobStatus {
  switch (status) {
    case "menunggu_pickup":
    case "diterima":
      return "ditugaskan";
    case "serah_terima_pool":
    case "menunggu_validasi":
      return "unloading";
    default:
      return status;
  }
}

// ── Foto per slot (BR-06) ────────────────────────────────────────────────────

export const SLOT_LABEL: Record<PhotoSlot, string> = {
  depan: "Foto sisi depan kendaraan",
  belakang: "Foto sisi belakang kendaraan",
  kanan: "Foto sisi kanan kendaraan",
  kiri: "Foto sisi kiri kendaraan",
  surat_jalan: "Foto surat jalan",
  serah_terima: "Foto serah terima dokumen"
};

export const STAGE_LABEL: Record<PhotoStage, string> = {
  loading: "Loading (muat)",
  unloading: "Unloading (bongkar)",
  serah_terima: "Serah terima di pool"
};

export const REQUIRED_SLOTS: Record<PhotoStage, PhotoSlot[]> = {
  loading: ["depan", "belakang", "kanan", "kiri", "surat_jalan"],
  unloading: ["depan", "belakang", "kanan", "kiri", "surat_jalan"],
  serah_terima: ["serah_terima"]
};

/** Tahap foto yang relevan untuk sebuah status (untuk tampilan driver). */
export function stageForStatus(status: JobStatus): PhotoStage | null {
  switch (status) {
    case "diterima":
    case "loading":
      return "loading";
    case "dalam_perjalanan":
    case "unloading":
      return "unloading";
    case "serah_terima_pool":
      return "serah_terima";
    default:
      return null;
  }
}

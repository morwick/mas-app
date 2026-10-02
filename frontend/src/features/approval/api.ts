import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

/** Fitur yang pengajuannya butuh approval (migration 20261001000009). */
export type FiturApproval = "tambahan_uang_jalan" | "penghapusan_aset" | "penjualan_aset";
/** salah_satu: cukup 1 setuju · semua: semua harus setuju · berjenjang: per level. */
export type ModeApproval = "salah_satu" | "semua" | "berjenjang";
export type StatusPengajuan = "menunggu" | "disetujui" | "ditolak" | "dibatalkan";
/** Status approval yang disimpan di data asli (uang jalan, penjualan, penghapusan). */
export type StatusApprovalData = "menunggu" | "disetujui" | "ditolak";

export const MODE_LABEL: Record<ModeApproval, string> = {
  salah_satu: "Cukup salah satu approver",
  semua: "Semua approver",
  berjenjang: "Berjenjang (per level)"
};

export const STATUS_PENGAJUAN_LABEL: Record<StatusPengajuan, string> = {
  menunggu: "Menunggu",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan"
};

export interface FiturApprovalInfo {
  kode: FiturApproval;
  nama: string;
  mode: ModeApproval;
  jumlah_approver: number;
}

export interface Approver {
  id: string;
  fitur_kode: FiturApproval;
  fitur_nama: string;
  mode: ModeApproval;
  karyawan_id: string;
  karyawan_nama: string;
  /** Level untuk mode berjenjang (1 = diputuskan pertama). */
  urutan: number;
  /** Karyawan nonaktif / di-blacklist tidak ikut di pengajuan baru. */
  karyawan_aktif: boolean;
}

export interface MenuApproval {
  kode: FiturApproval;
  nama: string;
  /** Pengajuan yang sedang menunggu keputusan pengguna ini. */
  menunggu_saya: number;
}

export interface LangkahApproval {
  karyawan_id: string;
  nama: string;
  urutan: number;
  keputusan: "menunggu" | "setuju" | "tolak" | "dilewati";
  catatan?: string | null;
  diputuskan_at?: string | null;
}

export interface PengajuanApproval {
  id: string;
  fitur_kode: FiturApproval;
  ref_id: string;
  judul: string;
  /** Salinan data yang diajukan — isinya berbeda per fitur. */
  rincian: Record<string, unknown>;
  nilai?: number | null;
  mode: ModeApproval;
  status_approval: StatusPengajuan;
  diajukan_oleh_nama?: string | null;
  diajukan_at: string;
  diputuskan_at?: string | null;
  alasan_tolak?: string | null;
  giliran_saya: boolean;
  langkah: LangkahApproval[];
}

export interface Halaman<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ── Master approver (superadmin) ────────────────────────────────────────────

export const listFiturApproval = () => api.get<FiturApprovalInfo[]>("/approval/fitur");

export function ubahModeApproval(kode: FiturApproval, mode: ModeApproval): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/approval/fitur/${kode}`, { mode }));
}

export interface ApproverFilter {
  page: number;
  pageSize: number;
  fitur: FiturApproval | "";
  q: string;
}

export const listApprover = (f: ApproverFilter) =>
  api.get<Halaman<Approver>>("/approval/approver", {
    page: f.page,
    page_size: f.pageSize,
    fitur: f.fitur || undefined,
    q: f.q.trim() || undefined
  });

export const listCalonApprover = () => api.get<{ id: string; nama: string }[]>("/approval/calon-approver");

export function tambahApprover(input: {
  fitur_kode: FiturApproval;
  karyawan_id: string;
  urutan: number;
}): Promise<ActionResult<unknown>> {
  return mutate(api.post("/approval/approver", input));
}

export function ubahUrutanApprover(id: string, urutan: number): Promise<ActionResult<unknown>> {
  return mutate(api.patch(`/approval/approver/${id}`, { urutan }));
}

/** Soft delete; pengajuan yang sedang berjalan tetap memakai susunan lamanya. */
export function hapusApprover(id: string): Promise<ActionResult<unknown>> {
  return mutate(api.delete(`/approval/approver/${id}`));
}

// ── Menu Approval (approver) ────────────────────────────────────────────────

export const menuApproval = () => api.get<MenuApproval[]>("/approval/menu");

export interface PengajuanFilter {
  fitur: FiturApproval;
  page: number;
  pageSize: number;
  hanyaGiliran: boolean;
  status: StatusPengajuan | "";
  q: string;
  /** "" = semua tahun / bulan. */
  tahun: string;
  bulan: string;
}

export const listPengajuan = (f: PengajuanFilter) =>
  api.get<Halaman<PengajuanApproval>>("/approval/pengajuan", {
    fitur: f.fitur,
    page: f.page,
    page_size: f.pageSize,
    hanya_giliran: f.hanyaGiliran || undefined,
    status: f.status || undefined,
    q: f.q.trim() || undefined,
    tahun: f.tahun || undefined,
    bulan: f.bulan || undefined
  });

/** Approver & keputusan satu tambahan uang jalan (kartu uang jalan di detail job). */
export interface RiwayatApproval {
  mode: ModeApproval;
  status_approval: StatusPengajuan;
  alasan_tolak?: string | null;
  diajukan_oleh_nama?: string | null;
  diajukan_at: string;
  langkah: LangkahApproval[];
}

export const getRiwayatApprovalUangJalan = (uangJalanId: string) =>
  api.get<RiwayatApproval>(`/approval/uang-jalan/${uangJalanId}`);

/** Satu pengajuan (halaman detail). 404 bila belum sampai giliran pengguna ini. */
export const getPengajuan = (fitur: FiturApproval, id: string) =>
  api.get<PengajuanApproval>(`/approval/pengajuan/${id}`, { fitur });

export function putuskanPengajuan(
  id: string,
  setuju: boolean,
  catatan: string | null
): Promise<ActionResult<{ status_approval: StatusPengajuan }>> {
  return mutate(api.post<{ status_approval: StatusPengajuan }>(`/approval/pengajuan/${id}/putuskan`, { setuju, catatan }));
}

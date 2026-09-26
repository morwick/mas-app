import { api } from "@/lib/api/client";
import type { Unit } from "@/types";

export interface LayoutCounts {
  units: number;
  jobs_active: number;
  drivers_available: number;
  jobs_menunggu_validasi: number;
  uang_jalan_diajukan: number;
}

export interface DashboardActiveJob {
  unit_id: string;
  job: { id: string; job_number: string; asal: string; tujuan: string; driver_nama: string };
}

export interface JobBelumKonfirmasi {
  id: string;
  job_number: string;
  customer_nama: string;
  driver_nama: string;
}

/** STNK / KIR / pajak / SIM yang sudah habis atau habis ≤ 30 hari lagi. */
export interface DokumenJatuhTempo {
  label: string;
  subjek: string;
  href: string;
  tanggal: string;
  /** Negatif = sudah lewat. */
  sisa_hari: number;
}

/** Unit di kartu Monitoring servis. */
export interface ServisUnit {
  unit_id: string;
  kode_unit: string;
  href: string;
  /** Lewat jadwal: km yang sudah dilewati. Mendekati: sisa km menuju servis. */
  km: number;
}

export interface MonitoringServis {
  lewat_jadwal: ServisUnit[];
  mendekati: ServisUnit[];
}

export interface DashboardData {
  units: Unit[];
  counts: { standby: number; bertugas: number; breakdown: number; perbaikan: number };
  active_jobs: DashboardActiveJob[];
  jobs_menunggu_validasi: number;
  uang_jalan_diajukan: number;
  /** Job ditugaskan tapi drivernya belum menekan Terima Job. */
  job_belum_konfirmasi: JobBelumKonfirmasi[];
  dokumen_jatuh_tempo: DokumenJatuhTempo[];
  monitoring_servis: MonitoringServis;
  /** Kartu "Perlu tindakan" — angka saja. */
  penawaran_deal_tanpa_job?: number;
  penawaran_akan_kedaluwarsa?: number;
  /** Job selesai & tervalidasi tapi belum masuk tagihan mana pun. */
  jobs_belum_invoice: number;
}

export const layoutCounts = () => api.get<LayoutCounts>("/layout/counts");
export const dashboard = () => api.get<DashboardData>("/dashboard");

export interface FinanceDashboardSummary {
  tagihan_belum_lunas_jumlah: number;
  tagihan_belum_lunas_nominal: number;
  tagihan_jatuh_tempo_jumlah: number;
  tagihan_jatuh_tempo_nominal: number;
  invoice_belum_faktur_pajak_jumlah: number;
  pembayaran_bulan_ini_nominal: number;
}

export const financeDashboard = () => api.get<FinanceDashboardSummary>("/dashboard/finance");

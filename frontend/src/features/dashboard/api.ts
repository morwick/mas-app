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

export interface DashboardData {
  units: Unit[];
  counts: { standby: number; bertugas: number; perbaikan: number };
  active_jobs: DashboardActiveJob[];
  jobs_menunggu_validasi: number;
  uang_jalan_diajukan: number;
  /** Job ditugaskan tapi drivernya belum menekan Terima Job. */
  job_belum_konfirmasi: JobBelumKonfirmasi[];
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

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

export interface DashboardData {
  units: Unit[];
  counts: { standby: number; bertugas: number; perbaikan: number };
  active_jobs: DashboardActiveJob[];
  jobs_menunggu_validasi: number;
  uang_jalan_diajukan: number;
}

export const layoutCounts = () => api.get<LayoutCounts>("/layout/counts");
export const dashboard = () => api.get<DashboardData>("/dashboard");

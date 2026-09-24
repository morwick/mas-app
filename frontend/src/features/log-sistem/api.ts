import { api } from "@/lib/api/client";

export type AksiLog = "Login" | "Logout" | "Tambah Data" | "Update Data" | "Hapus Data";

export const AKSI_LOG: AksiLog[] = ["Login", "Logout", "Tambah Data", "Update Data", "Hapus Data"];

export interface LogSistem {
  id: string;
  waktu: string;
  aksi: AksiLog;
  keterangan: string;
  ip_address: string | null;
  karyawan_id: string | null;
  karyawan_nama: string | null;
}

export interface LogSistemPage {
  items: LogSistem[];
  total: number;
  page: number;
  page_size: number;
}

export interface LogSistemFilter {
  page: number;
  pageSize: number;
  /** Tanggal WIB (YYYY-MM-DD), inklusif. */
  dari: string;
  sampai: string;
  karyawanId: string;
  aksi: AksiLog | "";
  q: string;
}

export const listLogSistem = (f: LogSistemFilter) =>
  api.get<LogSistemPage>("/log-sistem", {
    page: f.page,
    page_size: f.pageSize,
    dari: f.dari || undefined,
    sampai: f.sampai || undefined,
    karyawan_id: f.karyawanId || undefined,
    aksi: f.aksi || undefined,
    q: f.q.trim() || undefined
  });

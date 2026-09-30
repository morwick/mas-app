import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

/** Status koneksi TrackSolid (superadmin). */
export interface StatusTrackSolid {
  tersambung: boolean;
  /** Login otomatis ditolak karena butuh captcha — GPS berhenti diperbarui. */
  perlu_captcha: boolean;
  perlu_captcha_at: string | null;
  diperbarui_at: string | null;
  /** Karyawan yang terakhir login dengan captcha; null = login otomatis sistem. */
  diperbarui_oleh_nama: string | null;
}

export const getStatusTrackSolid = () => api.get<StatusTrackSolid>("/tracksolid/status");

/** Cek ringan (semua staf): hanya status di database, TrackSolid tidak dihubungi. */
export const cekSesiTrackSolid = () => api.get<{ perlu_captcha: boolean }>("/tracksolid/sesi");

/** Gambar captcha baru (data URL) — kodenya diketik superadmin. */
export const ambilCaptchaTrackSolid = () => api.post<{ gambar: string }>("/tracksolid/captcha");

export function loginCaptchaTrackSolid(kode: string): Promise<ActionResult<unknown>> {
  return mutate(api.post("/tracksolid/login", { kode }));
}

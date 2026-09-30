import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

/** Cek ringan (semua staf): hanya status di database, TrackSolid tidak dihubungi. */
export const cekSesiTrackSolid = () => api.get<{ perlu_captcha: boolean }>("/tracksolid/sesi");

/** Gambar captcha baru (data URL) — kodenya diketik pengguna. */
export const ambilCaptchaTrackSolid = () => api.post<{ gambar: string }>("/tracksolid/captcha");

export function loginCaptchaTrackSolid(kode: string): Promise<ActionResult<unknown>> {
  return mutate(api.post("/tracksolid/login", { kode }));
}

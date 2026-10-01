import { api } from "@/lib/api/client";
import type { Kecamatan } from "@/types";

/** Seluruh kecamatan aktif (~7 ribu baris) — dimuat sekali lalu disimpan cache. */
export const listKecamatan = () => api.get<Kecamatan[]>("/kecamatan");

/** Label & teks rute bawaan untuk surat, mis. "Kemayoran - Jakarta Pusat". */
export function teksKecamatan(k: Kecamatan): string {
  return `${k.nama} - ${k.kab_kota}`;
}

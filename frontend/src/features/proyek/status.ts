import type { ProyekRingkas } from "@/types";

/**
 * BATASAN: proyek berstatus "Dibatalkan" bila semua job-nya dibatalkan
 * (termasuk proyek yang hanya punya 1 job lalu job itu dibatalkan).
 * Status ini turunan dari jumlah job — tidak disimpan di database, jadi
 * otomatis kembali normal bila job baru ditambahkan ke proyek.
 */
export function proyekDibatalkan(p: Pick<ProyekRingkas, "jumlah_job" | "jumlah_job_batal">): boolean {
  return p.jumlah_job > 0 && p.jumlah_job_batal >= p.jumlah_job;
}

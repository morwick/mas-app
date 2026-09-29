import { isoToLocalInput } from "@/lib/utils";

// Aturan jadwal job — fungsi murni atas nilai isian tanggal-jam
// ("YYYY-MM-DDTHH:mm", jam WIB). Backend menjalankan aturan yang
// sama sebagai defense-in-depth sebelum menyimpan.

export const ETD_BACKDATE_MESSAGE =
  "Tanggal pickup tidak boleh tanggal yang sudah lewat";
export const ETA_BEFORE_ETD_MESSAGE =
  "Estimasi sampai tidak boleh lebih awal dari tanggal pickup";

/** "YYYY-MM-DDTHH:mm" → bagian tanggalnya saja, tanpa menyentuh zona waktu. */
function datePart(value: string): string {
  return value.slice(0, 10);
}

/** Tanggal hari ini di WIB, dalam format "YYYY-MM-DD". */
export function todayLocalDate(now: Date = new Date()): string {
  return isoToLocalInput(now.toISOString()).slice(0, 10);
}

/**
 * Batas bawah untuk atribut `min` pada input ETD — awal hari ini. Jam bebas,
 * yang dilarang hanya tanggal yang sudah lewat.
 */
export function minEtdValue(now: Date = new Date()): string {
  return `${todayLocalDate(now)}T00:00`;
}

/** True bila tanggal ETD lebih awal dari hari ini (jam tidak diperhitungkan). */
export function isBackDated(etd: string, now: Date = new Date()): boolean {
  if (!etd) return false;
  return datePart(etd) < todayLocalDate(now);
}

/** True bila ETA mendahului ETD. Sama persis dianggap sah. */
export function isEtaBeforeEtd(etd: string, eta: string): boolean {
  if (!etd || !eta) return false;
  return eta < etd; // format ISO lokal bisa dibandingkan sebagai string
}

/**
 * Validasi jadwal untuk kedua form job.
 *
 * `checkBackDate` dimatikan saat mengedit job yang ETD-nya tidak diubah —
 * job yang sudah berjalan wajar punya ETD di masa lalu, dan admin tidak boleh
 * terkunci hanya karena menyunting field lain.
 */
export function validateSchedule(
  etd: string,
  eta: string,
  opts: { checkBackDate?: boolean; now?: Date } = {}
): Record<string, string> {
  const { checkBackDate = true, now } = opts;
  const errs: Record<string, string> = {};
  if (checkBackDate && isBackDated(etd, now)) errs.etd = ETD_BACKDATE_MESSAGE;
  if (isEtaBeforeEtd(etd, eta)) errs.eta = ETA_BEFORE_ETD_MESSAGE;
  return errs;
}

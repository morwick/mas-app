import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Zona waktu aplikasi: semua isian & tampilan tanggal-jam memakai WIB (UTC+7). */
export const TZ_WIB = "Asia/Jakarta";
const OFFSET_WIB_MENIT = 7 * 60;

/**
 * ISO dari server → nilai isian tanggal-jam ("YYYY-MM-DDTHH:mm") dalam jam WIB,
 * tidak tergantung zona waktu komputer pengguna. Tanpa argumen: waktu sekarang.
 */
export function isoToLocalInput(iso?: string | null): string {
  if (iso === null) return "";
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + OFFSET_WIB_MENIT * 60000).toISOString().slice(0, 16);
}

/**
 * Nilai isian tanggal-jam (jam WIB, tanpa zona) → ISO dengan offset WIB,
 * mis. "2026-09-26T10:30:00+07:00".
 *
 * Tanpa offset, server menganggap jamnya UTC sehingga tersimpan 7 jam
 * bergeser. Bagian tanggalnya sengaja tetap tanggal WIB karena server
 * memakainya untuk cek "tanggal sudah lewat".
 */
export function localInputToIso(value: string): string {
  if (!value) return value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value;
  return `${value.slice(0, 16)}:00+07:00`;
}

/**
 * Tanggal hari ini di WIB ("YYYY-MM-DD"). Jangan pakai
 * `new Date().toISOString().slice(0, 10)` — itu tanggal UTC, sehingga sebelum
 * pukul 07.00 WIB hasilnya masih tanggal kemarin.
 */
export function hariIniWIB(now: Date = new Date()): string {
  return isoToLocalInput(now.toISOString()).slice(0, 10);
}

/** "YYYY-MM-DD" + n hari (boleh negatif) — aritmetika kalender murni, bebas zona waktu. */
export function tambahHari(tanggal: string, n: number): string {
  const d = new Date(`${tanggal.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nilai isian tanggal-jam WIB ("YYYY-MM-DDTHH:mm") → Date; null bila tidak valid. */
export function localInputToDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(localInputToIso(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatDateTime(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ_WIB,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

const WIB_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_WIB,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23: tengah malam "00", bukan "24".
  hourCycle: "h23"
});

/**
 * Waktu WIB format `Y-m-d H:i:s`, mis. "2026-09-24 08:05:09".
 *
 * Selalu memakai Asia/Jakarta (UTC+7, sama dengan Bangkok), tidak tergantung
 * zona waktu komputer pengguna — server mengirim waktu dalam UTC.
 */
export function formatWaktuWIB(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  const p = Object.fromEntries(WIB_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Bulan (1–12) & tahun sebuah waktu menurut WIB; tanpa argumen = saat ini. */
export function bulanTahunWIB(date: Date | string = new Date()): { bulan: number; tahun: number } {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = Object.fromEntries(WIB_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { bulan: Number(p.month), tahun: Number(p.year) };
}

export function formatDate(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ_WIB,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}

export function formatTime(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ_WIB,
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  // Waktu di masa depan (jam perangkat tidak sinkron) tidak ditampilkan minus.
  if (sec < 10) return "Baru saja";
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} bulan lalu`;
  return `${Math.floor(month / 12)} tahun lalu`;
}

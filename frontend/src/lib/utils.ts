import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * ISO (dari server, UTC) → nilai `<input type="datetime-local">`
 * ("YYYY-MM-DDTHH:mm") di jam lokal browser. Tanpa argumen: waktu sekarang.
 */
export function isoToLocalInput(iso?: string | null): string {
  if (iso === null) return "";
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Nilai `<input type="datetime-local">` (jam lokal browser, tanpa zona) → ISO
 * dengan offset zona browser, mis. "2026-09-26T10:30:00+07:00".
 *
 * Tanpa offset, server menganggap jamnya UTC sehingga tersimpan 7 jam
 * bergeser. Bagian tanggalnya sengaja tetap tanggal lokal karena server
 * memakainya untuk cek "tanggal sudah lewat".
 */
export function localInputToIso(value: string): string {
  if (!value) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const menit = -d.getTimezoneOffset();
  const tanda = menit >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${value.slice(0, 16)}:00${tanda}${pad(menit / 60)}:${pad(menit % 60)}`;
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
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

const WIB_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
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

export function formatDate(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}

export function formatTime(date: Date | string | undefined | null) {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
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

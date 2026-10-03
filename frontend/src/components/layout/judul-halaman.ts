/**
 * Judul header halaman beserta jejaknya (breadcrumb):
 *   halaman menu        → "Penawaran"
 *   halaman lebih dalam → "Penawaran / Detail Penawaran"
 *   halaman form        → "Penawaran / Edit Penawaran" (tanpa jejak bertingkat)
 * Jejak (bagian kiri, kecil) bisa diklik untuk kembali ke halaman itu; judul
 * (bagian kanan) adalah halaman yang sedang dibuka.
 */

import { navItems } from "./nav-items";

export interface Jejak {
  label: string;
  /** Kosong = tidak bisa diklik (tidak ada halamannya). */
  href?: string;
}

export interface JudulHalaman {
  jejak: Jejak[];
  judul: string;
}

/** Bagian URL yang berupa id (uuid / angka panjang), bukan nama halaman. */
const pakaiId = (seg: string) => seg.length > 8 && /^[0-9a-f-]+$/i.test(seg);

/** Halaman di bawah menu yang namanya bukan "Detail <menu>". */
const SUB_HALAMAN: Record<string, string> = {
  "/proyek/per-unit": "Proyek per Unit",
  "/jobs/jadwal": "Jadwal Job",
  "/tracking/peta": "Peta Armada",
  "/reports/utilisasi": "Utilisasi Armada",
  "/reports/laba": "Laporan Laba",
  "/reports/laba-tahunan": "Laba Tahunan",
  "/reports/customers": "Riwayat per Customer",
  "/reports/perawatan": "Biaya Perawatan & Klaim Asuransi"
};

/** Nama objek halaman detail per awalan URL (default: label menu). */
const NAMA_OBJEK: Record<string, string> = {
  tracking: "Pantau Job",
  "perintah-kerja": "Perintah Kerja"
};

/** Menu yang punya halaman detail /<menu>/:id (jadi "Detail X" bisa diklik dari halaman edit). */
const ADA_DETAIL = new Set([
  "units",
  "unit-trailer",
  "drivers",
  "asuransi",
  "perintah-kerja",
  "quotations",
  "proyek",
  "jobs",
  "invoices"
]);

/**
 * Asal halaman yang dibawa link (state router, bukan database): job yang
 * dibuka dari detail proyek berjejak "Proyek / Detail Proyek / Detail Job".
 */
export interface StateJejak {
  jejakAsal: Jejak[];
}

/** State link job dari halaman detail proyek. */
export function jejakDariProyek(proyekId: string): StateJejak {
  return {
    jejakAsal: [
      { label: "Proyek", href: "/proyek" },
      { label: "Detail Proyek", href: `/proyek/${proyekId}` }
    ]
  };
}

/** Ambil jejak asal dari state router (abaikan bentuk lain). */
export function bacaJejakAsal(state: unknown): Jejak[] | undefined {
  const jejak = (state as Partial<StateJejak> | null)?.jejakAsal;
  if (!Array.isArray(jejak) || jejak.length === 0) return undefined;
  return jejak.every((j) => typeof j?.label === "string") ? jejak : undefined;
}

/** Halaman form (tambah / edit) — headernya selalu "Menu / Tambah|Edit X". */
const halamanForm = (pathname: string) => /\/(new|edit|tambah-job)$/.test(pathname);

/**
 * `jejakAsal` (opsional) menggantikan jejak menu untuk halaman job
 * (/jobs/:id dan halaman di bawahnya) — mis. dibuka dari detail proyek.
 * Halaman form tidak memakainya.
 */
export function susunJudul(pathname: string, jejakAsal?: Jejak[]): JudulHalaman {
  const hasil = susunJudulMenu(pathname);
  const seg = pathname.split("/").filter(Boolean);
  if (jejakAsal && !halamanForm(pathname) && seg[0] === "jobs" && seg[1] && pakaiId(seg[1]) && hasil.jejak.length > 0) {
    return { jejak: [...jejakAsal, ...hasil.jejak.slice(1)], judul: hasil.judul };
  }
  return hasil;
}

function susunJudulMenu(pathname: string): JudulHalaman {
  const root = navItems.find((n) => n.match?.(pathname));
  if (!root) return { jejak: [], judul: "MAS" };
  const seg = pathname.split("/").filter(Boolean);
  const menu: Jejak = { label: root.label, href: root.href };

  // Approval: /approval/:fitur (daftar) & /approval/:fitur/:id (detail).
  if (seg[0] === "approval") {
    if (seg.length <= 2) return { jejak: [], judul: root.label };
    return { jejak: [{ label: root.label, href: `/approval/${seg[1]}` }], judul: "Detail Pengajuan" };
  }

  if (seg.length <= 1) return { jejak: [], judul: root.label };

  const sub = SUB_HALAMAN[`/${seg[0]}/${seg[1]}`];
  if (sub && seg.length === 2) return { jejak: [menu], judul: sub };

  // Perintah kerja ada di bawah menu Service.
  const objek = NAMA_OBJEK[seg[0]] ?? root.label;
  const [, kedua, ketiga] = seg;

  if (kedua === "new") return { jejak: [menu], judul: `Tambah ${objek}` };

  if (pakaiId(kedua)) {
    const detail: Jejak = {
      label: `Detail ${objek}`,
      href: ADA_DETAIL.has(seg[0]) ? `/${seg[0]}/${kedua}` : undefined
    };
    if (!ketiga) return { jejak: [menu], judul: `Detail ${objek}` };
    // Halaman di bawah detail: jejaknya Menu / Detail X (bila ada halamannya).
    const atas = detail.href ? [menu, detail] : [menu];
    // Halaman form cukup "Menu / Edit X" — tanpa jejak bertingkat.
    if (ketiga === "edit") return { jejak: [menu], judul: `Edit ${objek}` };
    if (ketiga === "tambah-job") return { jejak: [menu], judul: "Tambah Job" };
    if (ketiga === "confirmation") return { jejak: atas, judul: "Bagikan ke Customer" };
    return { jejak: atas, judul: `Detail ${objek}` };
  }

  return { jejak: [], judul: root.label };
}

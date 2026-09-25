import {
  LayoutDashboard,
  Truck,
  PackageCheck,
  UserRound,
  Building2,
  UsersRound,
  CircleUserRound,
  BarChart3,
  FileText,
  Wrench,
  Map,
  Wallet,
  Receipt,
  HandCoins,
  Tags,
  Boxes,
  Bell,
  Activity,
  ScrollText,
  Container,
  IdCard,
  BadgeDollarSign,
  type LucideIcon
} from "lucide-react";

export type UserRoleLike = "superadmin" | "operator" | "finance" | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
  /** Role yang boleh melihat menu ini. Kosong/undefined = semua role login. */
  roles?: UserRoleLike[];
}

/** Induk menu yang hanya menampung submenu — bukan tautan. */
export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// ── Item individual ────────────────────────────────────────────────────────
const dashboard: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
  match: (p) => p === "/dashboard"
};

const unit: NavItem = {
  href: "/units",
  label: "Unit",
  icon: Truck,
  match: (p) => p.startsWith("/units"),
  // Operator hanya lihat (tombol tambah/ubah/hapus disembunyikan di komponen).
  roles: ["superadmin", "admin", "operator"]
};

const unitTrailer: NavItem = {
  href: "/unit-trailer",
  label: "Unit Trailer",
  icon: Container,
  match: (p) => p.startsWith("/unit-trailer"),
  roles: ["superadmin", "admin", "operator"]
};

const jenisUnit: NavItem = {
  // Master jenis armada (lowbed, highbed, dst). Ditaruh tepat di bawah Unit
  // karena isinya yang mengklasifikasikan unit.
  href: "/jenis-unit",
  label: "Jenis Unit",
  icon: Tags,
  match: (p) => p.startsWith("/jenis-unit"),
  roles: ["superadmin", "admin"]
};

const driver: NavItem = {
  href: "/drivers",
  label: "Driver",
  icon: UserRound,
  match: (p) => p.startsWith("/drivers"),
  roles: ["superadmin", "admin", "operator"]
};

const customer: NavItem = {
  href: "/customers",
  label: "Customer",
  icon: Building2,
  match: (p) => p.startsWith("/customers"),
  roles: ["superadmin", "admin", "finance"]
};

const penawaran: NavItem = {
  href: "/quotations",
  label: "Penawaran",
  icon: FileText,
  match: (p) => p.startsWith("/quotations"),
  roles: ["superadmin", "admin"]
};

const job: NavItem = {
  href: "/jobs",
  label: "Job",
  icon: PackageCheck,
  match: (p) => p.startsWith("/jobs"),
  roles: ["superadmin", "admin"]
};

const pantau: NavItem = {
  href: "/tracking",
  label: "Pantau",
  icon: Map,
  match: (p) => p.startsWith("/tracking"),
  // Operator: lihat saja — tombol aksi cepat/cancel/edit disembunyikan di komponen.
  roles: ["superadmin", "admin", "operator"]
};

const uangJalan: NavItem = {
  href: "/uang-jalan",
  label: "Uang Jalan",
  icon: Wallet,
  match: (p) => p.startsWith("/uang-jalan"),
  roles: ["superadmin", "admin", "operator"]
};

const service: NavItem = {
  href: "/services",
  label: "Service",
  icon: Wrench,
  match: (p) => p.startsWith("/services"),
  // Operator: lihat + tambah service saja (tidak ada UI edit/hapus record service).
  roles: ["superadmin", "admin", "operator"]
};

const tagihan: NavItem = {
  href: "/invoices",
  label: "Tagihan",
  icon: Receipt,
  match: (p) => p.startsWith("/invoices"),
  roles: ["superadmin", "finance"]
};

const piutang: NavItem = {
  // Piutang dipisah dari daftar tagihan: yang dilihat di sini bukan dokumen
  // satu per satu, melainkan siapa yang belum bayar dan sudah berapa lama.
  href: "/piutang",
  label: "Piutang",
  icon: HandCoins,
  match: (p) => p.startsWith("/piutang"),
  roles: ["superadmin", "finance"]
};

const penjualan: NavItem = {
  // Satu-satunya jalan menandai unit / unit trailer "Terjual" — lengkap
  // dengan data pembeli, harga, dan bukti transaksinya.
  href: "/penjualan-unit",
  label: "Penjualan Unit",
  icon: BadgeDollarSign,
  match: (p) => p.startsWith("/penjualan-unit"),
  roles: ["superadmin"]
};

const laporan: NavItem = {
  // Semua role login boleh lihat menu ini; operator cuma dapat sub-laporan
  // Utilisasi Armada (disaring di ReportsIndexPage + guard rute /reports/laba
  // & /reports/customers).
  href: "/reports",
  label: "Laporan",
  icon: BarChart3,
  match: (p) => p.startsWith("/reports")
};

const pengguna: NavItem = {
  // Dulu tinggal di Pengaturan. Menu itu sudah dihapus, dan halaman ini
  // bentuknya daftar master seperti tetangganya — jadi rumahnya di sini.
  href: "/pengguna",
  label: "Pengguna",
  icon: UsersRound,
  match: (p) => p.startsWith("/pengguna"),
  roles: ["superadmin"]
};

const karyawan: NavItem = {
  // Data hr.karyawan: sumber nama akun pengguna dan driver.
  href: "/karyawan",
  label: "Karyawan",
  icon: IdCard,
  match: (p) => p.startsWith("/karyawan"),
  roles: ["superadmin"]
};

const logSistem: NavItem = {
  // Jejak audit: siapa melakukan apa, kapan, dari IP mana.
  href: "/log-sistem",
  label: "Log Sistem",
  icon: ScrollText,
  match: (p) => p.startsWith("/log-sistem"),
  roles: ["superadmin", "finance"]
};

const notifikasi: NavItem = {
  href: "/notifikasi",
  label: "Notifikasi",
  icon: Bell,
  match: (p) => p.startsWith("/notifikasi")
};

/**
 * Profil tidak muncul di sidebar — dibuka dari menu profil di top bar.
 * Tetap didaftarkan supaya judul halaman & breadcrumb menemukannya.
 */
export const profileItem: NavItem = {
  href: "/profil",
  label: "Profil",
  icon: CircleUserRound,
  match: (p) => p.startsWith("/profil")
};

// ── Susunan menu ───────────────────────────────────────────────────────────
export const navTree: NavEntry[] = [
  dashboard,
  {
    key: "master",
    label: "Master",
    icon: Boxes,
    items: [karyawan, pengguna, jenisUnit, unit, unitTrailer, driver, customer]
  },
  {
    key: "monitoring",
    label: "Monitoring",
    icon: Activity,
    items: [penawaran, job, pantau, uangJalan, service, tagihan, piutang, penjualan]
  },
  laporan,
  logSistem,
  notifikasi
];

/** Semua item dalam satu larik datar — dipakai pencarian judul halaman. */
export const navItems: NavItem[] = [
  ...navTree.flatMap((e) => (isNavGroup(e) ? e.items : [e])),
  profileItem
];

// Dicari lewat href, bukan indeks: menyisipkan menu baru di navItems dulu
// diam-diam menggeser isi bottom nav karena indeksnya ikut bergeser.
function byHref(href: string): NavItem {
  const found = navItems.find((i) => i.href === href);
  if (!found) throw new Error(`nav item ${href} tidak ada di navItems`);
  return found;
}

export const mobileNavItems: NavItem[] = [
  byHref("/dashboard"),
  byHref("/units"),
  byHref("/jobs"),
  byHref("/tracking"),
  byHref("/reports") // dibatasi role saat render — lihat visibleNavItems
];

function roleAllowed(item: NavItem, role: UserRoleLike | null | undefined): boolean {
  if (!item.roles) return true;
  return role != null && item.roles.includes(role);
}

export function visibleNavItems(items: NavItem[], role: UserRoleLike | null | undefined): NavItem[] {
  return items.filter((i) => roleAllowed(i, role));
}

/**
 * Pohon menu sesuai role. Grup yang seluruh submenunya tersembunyi ikut
 * dibuang supaya tidak menyisakan induk kosong.
 */
export function visibleNavTree(tree: NavEntry[], role: UserRoleLike | null | undefined): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of tree) {
    if (!isNavGroup(entry)) {
      if (roleAllowed(entry, role)) out.push(entry);
      continue;
    }
    const items = entry.items.filter((i) => roleAllowed(i, role));
    if (items.length > 0) out.push({ ...entry, items });
  }
  return out;
}

/** True bila salah satu submenu grup sedang aktif. */
export function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((i) =>
    i.match ? i.match(pathname) : pathname.startsWith(i.href)
  );
}

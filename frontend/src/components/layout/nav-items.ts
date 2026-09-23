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
  Activity,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
  /** Kalau true, menu ini hanya tampil untuk role 'superadmin'. */
  superadminOnly?: boolean;
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
  match: (p) => p.startsWith("/units")
};

const jenisUnit: NavItem = {
  // Master jenis armada (lowbed, highbed, dst). Ditaruh tepat di bawah Unit
  // karena isinya yang mengklasifikasikan unit.
  href: "/jenis-unit",
  label: "Jenis Unit",
  icon: Tags,
  match: (p) => p.startsWith("/jenis-unit"),
  superadminOnly: true
};

const driver: NavItem = {
  href: "/drivers",
  label: "Driver",
  icon: UserRound,
  match: (p) => p.startsWith("/drivers")
};

const customer: NavItem = {
  href: "/customers",
  label: "Customer",
  icon: Building2,
  match: (p) => p.startsWith("/customers")
};

const penawaran: NavItem = {
  href: "/quotations",
  label: "Penawaran",
  icon: FileText,
  match: (p) => p.startsWith("/quotations")
};

const job: NavItem = {
  href: "/jobs",
  label: "Job",
  icon: PackageCheck,
  match: (p) => p.startsWith("/jobs")
};

const pantau: NavItem = {
  href: "/tracking",
  label: "Pantau",
  icon: Map,
  match: (p) => p.startsWith("/tracking")
};

const uangJalan: NavItem = {
  href: "/uang-jalan",
  label: "Uang Jalan",
  icon: Wallet,
  match: (p) => p.startsWith("/uang-jalan")
};

const service: NavItem = {
  href: "/services",
  label: "Service",
  icon: Wrench,
  match: (p) => p.startsWith("/services"),
  superadminOnly: true
};

const tagihan: NavItem = {
  href: "/invoices",
  label: "Tagihan",
  icon: Receipt,
  match: (p) => p.startsWith("/invoices")
};

const piutang: NavItem = {
  // Piutang dipisah dari daftar tagihan: yang dilihat di sini bukan dokumen
  // satu per satu, melainkan siapa yang belum bayar dan sudah berapa lama.
  href: "/piutang",
  label: "Piutang",
  icon: HandCoins,
  match: (p) => p.startsWith("/piutang"),
  superadminOnly: true
};

const laporan: NavItem = {
  href: "/reports",
  label: "Laporan",
  icon: BarChart3,
  match: (p) => p.startsWith("/reports"),
  superadminOnly: true
};

const pengguna: NavItem = {
  // Dulu tinggal di Pengaturan. Menu itu sudah dihapus, dan halaman ini
  // bentuknya daftar master seperti tetangganya — jadi rumahnya di sini.
  href: "/pengguna",
  label: "Pengguna",
  icon: UsersRound,
  match: (p) => p.startsWith("/pengguna"),
  superadminOnly: true
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
    items: [pengguna, jenisUnit, unit, driver, customer]
  },
  {
    key: "monitoring",
    label: "Monitoring",
    icon: Activity,
    items: [penawaran, job, pantau, uangJalan, service, tagihan, piutang]
  },
  laporan
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
  byHref("/reports") // superadmin-only — di-filter saat render
];

export type UserRoleLike = "superadmin" | "operator";

export function visibleNavItems(
  items: NavItem[],
  role: UserRoleLike | null | undefined
): NavItem[] {
  if (role === "operator") return items.filter((i) => !i.superadminOnly);
  return items;
}

/**
 * Pohon menu sesuai role. Grup yang seluruh submenunya tersembunyi ikut
 * dibuang supaya tidak menyisakan induk kosong.
 */
export function visibleNavTree(
  tree: NavEntry[],
  role: UserRoleLike | null | undefined
): NavEntry[] {
  if (role !== "operator") return tree;
  const out: NavEntry[] = [];
  for (const entry of tree) {
    if (!isNavGroup(entry)) {
      if (!entry.superadminOnly) out.push(entry);
      continue;
    }
    const items = entry.items.filter((i) => !i.superadminOnly);
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

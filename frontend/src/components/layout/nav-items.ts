import {
  LayoutDashboard,
  Truck,
  PackageCheck,
  UserRound,
  Building2,
  BarChart3,
  FileText,
  Settings,
  Wrench,
  Map,
  Wallet,
  Receipt,
  HandCoins,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
  /** Kalau true, menu ini hanya tampil untuk role 'owner'. */
  ownerOnly?: boolean;
}

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/dashboard"
  },
  {
    href: "/units",
    label: "Unit",
    icon: Truck,
    match: (p) => p.startsWith("/units")
  },
  {
    href: "/quotations",
    label: "Penawaran",
    icon: FileText,
    match: (p) => p.startsWith("/quotations")
  },
  {
    href: "/jobs",
    label: "Job",
    icon: PackageCheck,
    match: (p) => p.startsWith("/jobs")
  },
  {
    href: "/tracking",
    label: "Pantau",
    icon: Map,
    match: (p) => p.startsWith("/tracking")
  },
  {
    href: "/invoices",
    label: "Tagihan",
    icon: Receipt,
    match: (p) => p.startsWith("/invoices")
  },
  {
    // Piutang dipisah dari daftar tagihan: yang dilihat di sini bukan dokumen
    // satu per satu, melainkan siapa yang belum bayar dan sudah berapa lama.
    href: "/piutang",
    label: "Piutang",
    icon: HandCoins,
    match: (p) => p.startsWith("/piutang"),
    ownerOnly: true
  },
  {
    href: "/uang-jalan",
    label: "Uang Jalan",
    icon: Wallet,
    match: (p) => p.startsWith("/uang-jalan")
  },
  {
    href: "/drivers",
    label: "Driver",
    icon: UserRound,
    match: (p) => p.startsWith("/drivers")
  },
  {
    href: "/customers",
    label: "Customer",
    icon: Building2,
    match: (p) => p.startsWith("/customers")
  },
  {
    href: "/services",
    label: "Service",
    icon: Wrench,
    match: (p) => p.startsWith("/services"),
    ownerOnly: true
  },
  {
    href: "/reports",
    label: "Laporan",
    icon: BarChart3,
    match: (p) => p.startsWith("/reports"),
    ownerOnly: true
  },
  {
    href: "/settings",
    label: "Pengaturan",
    icon: Settings,
    match: (p) => p.startsWith("/settings")
  }
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
  byHref("/reports") // owner-only — di-filter saat render
];

export type UserRoleLike = "owner" | "operator";

export function visibleNavItems(
  items: NavItem[],
  role: UserRoleLike | null | undefined
): NavItem[] {
  if (role === "operator") return items.filter((i) => !i.ownerOnly);
  return items;
}

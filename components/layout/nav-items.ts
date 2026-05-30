import {
  LayoutDashboard,
  Truck,
  PackageCheck,
  UserRound,
  Building2,
  BarChart3,
  Settings,
  Wrench,
  Map,
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

export const mobileNavItems: NavItem[] = [
  navItems[0], // Dashboard
  navItems[1], // Unit
  navItems[2], // Job
  navItems[3], // Pantau
  navItems[7]  // Laporan (owner-only — di-filter saat render)
];

export type UserRoleLike = "owner" | "operator";

export function visibleNavItems(
  items: NavItem[],
  role: UserRoleLike | null | undefined
): NavItem[] {
  if (role === "operator") return items.filter((i) => !i.ownerOnly);
  return items;
}

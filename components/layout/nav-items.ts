import {
  LayoutDashboard,
  Truck,
  PackageCheck,
  UserRound,
  Building2,
  BarChart3,
  Settings,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (pathname: string) => boolean;
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
    href: "/reports",
    label: "Laporan",
    icon: BarChart3,
    match: (p) => p.startsWith("/reports")
  },
  {
    href: "/settings",
    label: "Pengaturan",
    icon: Settings,
    match: (p) => p.startsWith("/settings")
  }
];

export const mobileNavItems: NavItem[] = [
  navItems[0],
  navItems[1],
  navItems[2],
  navItems[3],
  navItems[5]
];

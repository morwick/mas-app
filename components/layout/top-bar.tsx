"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import { navItems } from "./nav-items";

function getBreadcrumb(pathname: string): { label: string; href?: string }[] {
  const root = navItems.find((n) => n.match?.(pathname));
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [];
  if (root) crumbs.push({ label: root.label, href: root.href });

  const sub = segments.slice(1);
  for (let i = 0; i < sub.length; i++) {
    const seg = sub[i];
    if (seg === "new") crumbs.push({ label: "Baru" });
    else if (seg === "edit") crumbs.push({ label: "Edit" });
    else if (seg === "confirmation") crumbs.push({ label: "Konfirmasi" });
    else if (seg === "utilisasi") crumbs.push({ label: "Utilisasi armada" });
    else if (seg === "customers" && segments[0] === "reports")
      crumbs.push({ label: "Riwayat customer" });
    else if (seg === "profile") crumbs.push({ label: "Profil" });
    else if (seg === "jenis-unit") crumbs.push({ label: "Jenis unit" });
    else if (seg.length > 8 && /[0-9a-f-]/i.test(seg)) crumbs.push({ label: "Detail" });
  }
  return crumbs;
}

interface TopBarProps {
  user: { nama: string; email: string; initials: string } | null;
}

export function TopBar({ user }: TopBarProps) {
  const pathname = usePathname();
  const crumbs = getBreadcrumb(pathname);

  return (
    <header className="hidden lg:flex h-14 sticky top-0 z-30 bg-white border-b border-border items-center justify-between px-6">
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-subtle" />}
            {c.href ? (
              <Link
                href={c.href}
                className="text-text-muted hover:text-text"
              >
                {c.label}
              </Link>
            ) : (
              <span className="text-text font-medium">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifikasi"
          className="relative w-9 h-9 rounded-md hover:bg-page flex items-center justify-center text-text-muted"
        >
          <Bell className="w-4 h-4" />
        </button>
        {user && (
          <Link
            href="/settings/profile"
            className="flex items-center gap-2 pl-3 border-l border-border hover:opacity-80"
          >
            <div className="w-8 h-8 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-[12px] font-semibold">
              {user.initials}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium text-text">{user.nama}</span>
              <span className="text-[11px] text-text-muted">{user.email}</span>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}

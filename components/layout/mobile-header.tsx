"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { Logo } from "./logo";
import { navItems } from "./nav-items";

function getPageTitle(pathname: string) {
  const root = navItems.find((n) => n.match?.(pathname));
  if (!root) return "MAS";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return root.label;
  const last = segments[segments.length - 1];
  if (last === "new") return `${root.label} baru`;
  if (last === "edit") return `Edit ${root.label.toLowerCase()}`;
  if (last === "confirmation") return "Konfirmasi job";
  if (last === "utilisasi") return "Utilisasi armada";
  if (segments[0] === "reports" && last === "customers") return "Riwayat customer";
  if (segments[0] === "settings" && last === "profile") return "Profil";
  if (segments[0] === "settings" && last === "jenis-unit") return "Jenis unit";
  return `Detail ${root.label.toLowerCase()}`;
}

export function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = ["/dashboard"].includes(pathname);
  const title = getPageTitle(pathname);

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-3">
        {isRoot ? (
          <Logo size="sm" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Kembali"
              className="w-9 h-9 rounded-md hover:bg-page flex items-center justify-center text-text"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[16px] font-medium text-text truncate">{title}</h1>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-label="Notifikasi"
            className="relative w-9 h-9 rounded-md hover:bg-page flex items-center justify-center text-text-muted"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand rounded-full" />
          </Link>
        </div>
      </div>
    </header>
  );
}

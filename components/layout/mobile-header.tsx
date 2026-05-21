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
  if (segments[0] === "reports" && last === "customers")
    return "Riwayat customer";
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
    <header
      className="lg:hidden sticky top-0 z-30 bg-white"
      style={{ borderBottom: "0.5px solid var(--border-default)" }}
    >
      <div
        className="flex items-center justify-between"
        style={{ height: 56, padding: "0 12px" }}
      >
        {isRoot ? (
          <Logo size="sm" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Kembali"
              className="btn-ghost"
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <ArrowLeft style={{ width: 20, height: 20 }} />
            </button>
            <h1
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {title}
            </h1>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            aria-label="Notifikasi"
            className="btn-ghost"
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: "transparent",
              color: "var(--text-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative"
            }}
          >
            <Bell style={{ width: 18, height: 18 }} />
            <span
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 7,
                height: 7,
                borderRadius: 99,
                background: "#c13838",
                border: "1.5px solid white"
              }}
            />
          </Link>
        </div>
      </div>
    </header>
  );
}

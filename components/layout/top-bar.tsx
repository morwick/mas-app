"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { navItems } from "./nav-items";
import { NotificationBell } from "./notification-bell";

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
    else if (seg.length > 8 && /[0-9a-f-]/i.test(seg))
      crumbs.push({ label: "Detail" });
  }
  return crumbs;
}

function getPageTitle(pathname: string): string {
  const crumbs = getBreadcrumb(pathname);
  if (crumbs.length === 0) return "MAS";
  const last = crumbs[crumbs.length - 1];
  if (crumbs.length === 1) return last.label;
  const root = crumbs[0].label;
  if (last.label === "Baru") return `${root} baru`;
  if (last.label === "Edit") return `Edit ${root.toLowerCase()}`;
  if (last.label === "Konfirmasi") return "Konfirmasi job";
  if (last.label === "Detail") return `Detail ${root.toLowerCase()}`;
  return last.label;
}

export function TopBar() {
  const pathname = usePathname();
  const crumbs = getBreadcrumb(pathname);
  const title = getPageTitle(pathname);
  const breadcrumbTrail = crumbs.length > 1 ? crumbs.slice(0, -1) : [];

  return (
    <header
      className="hidden lg:flex items-center sticky top-0 z-30 bg-white"
      style={{
        height: "var(--topbar-h)",
        borderBottom: "0.5px solid var(--border-default)",
        padding: "0 24px",
        gap: 16
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumbTrail.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginBottom: 2
            }}
          >
            {breadcrumbTrail.map((c, i) => (
              <span
                key={i}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {i > 0 && <ChevronRight style={{ width: 12, height: 12 }} />}
                {c.href ? (
                  <Link
                    href={c.href}
                    style={{
                      color: "var(--text-tertiary)",
                      textDecoration: "none"
                    }}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>{c.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="h2">{title}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
              pointerEvents: "none",
              display: "flex"
            }}
          >
            <Search style={{ width: 15, height: 15 }} />
          </div>
          <input
            placeholder="Cari job, unit, customer…"
            className="input"
            style={{
              width: 280,
              paddingLeft: 36,
              paddingRight: 56,
              height: 36,
              fontSize: 13
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              gap: 3,
              pointerEvents: "none"
            }}
          >
            <span className="kbd">⌘</span>
            <span className="kbd">K</span>
          </div>
        </div>
        <NotificationBell variant="desktop" />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { Logo } from "./logo";
import { navItems, visibleNavItems } from "./nav-items";
import { LogoutButton } from "@/components/auth/logout-button";

interface SidebarProps {
  user: {
    nama: string;
    email: string;
    initials: string;
    role?: "owner" | "operator";
  } | null;
  counts?: {
    units?: number;
    jobsActive?: number;
    driversAvailable?: number;
  };
}

const COUNT_KEY: Record<string, keyof NonNullable<SidebarProps["counts"]>> = {
  "/units": "units",
  "/jobs": "jobsActive",
  "/drivers": "driversAvailable"
};

const BADGE_KEYS = new Set(["/jobs"]);

export function Sidebar({ user, counts }: SidebarProps) {
  const pathname = usePathname();
  const mainItems = visibleNavItems(navItems, user?.role).filter(
    (n) => n.href !== "/settings"
  );
  const settingsActive = pathname.startsWith("/settings");
  const roleBadgeLabel = user?.role === "operator" ? "Operator" : "Owner";
  const roleBadgeColor =
    user?.role === "operator"
      ? { bg: "#fff4e0", fg: "#8a5a00" }
      : { bg: "var(--brand-primary-light)", fg: "var(--brand-primary-dark)" };

  return (
    <aside
      className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0"
      style={{
        width: "var(--sidebar-w)",
        background: "white",
        borderRight: "0.5px solid var(--border-default)"
      }}
    >
      <div style={{ padding: "20px 18px 14px" }}>
        <Logo size="md" showSub />
      </div>
      <div className="divider" />
      <nav
        className="flex-1 overflow-y-auto scroll-region"
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 2 }}
      >
        <div className="eyebrow" style={{ padding: "8px 10px 4px" }}>
          Menu
        </div>
        {mainItems.map((item) => {
          const active = item.match
            ? item.match(pathname)
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          const countKey = COUNT_KEY[item.href];
          const count = countKey ? counts?.[countKey] : undefined;
          const badge = BADGE_KEYS.has(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: active ? "var(--brand-primary-light)" : "transparent",
                color: active
                  ? "var(--brand-primary-dark)"
                  : "var(--text-primary)",
                textDecoration: "none",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                transition: "background 120ms ease"
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--bg-muted)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon style={{ width: 18, height: 18 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {count != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 99,
                    background: badge
                      ? "var(--brand-primary)"
                      : "rgba(0,0,0,0.06)",
                    color: badge ? "white" : "var(--text-secondary)",
                    minWidth: 20,
                    textAlign: "center"
                  }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="divider" />
      <Link
        href="/settings"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          margin: 12,
          borderRadius: 8,
          background: settingsActive
            ? "var(--brand-primary-light)"
            : "transparent",
          color: settingsActive
            ? "var(--brand-primary-dark)"
            : "var(--text-primary)",
          textDecoration: "none",
          fontSize: 13.5,
          fontWeight: settingsActive ? 600 : 500
        }}
        onMouseEnter={(e) => {
          if (!settingsActive)
            e.currentTarget.style.background = "var(--bg-muted)";
        }}
        onMouseLeave={(e) => {
          if (!settingsActive)
            e.currentTarget.style.background = "transparent";
        }}
      >
        <Settings style={{ width: 18, height: 18 }} />
        Pengaturan
      </Link>
      <div
        style={{
          padding: "12px 14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderTop: "0.5px solid var(--border-default)"
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            background: "var(--brand-primary)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 12,
            flexShrink: 0
          }}
        >
          {user?.initials ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 1
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0
              }}
            >
              {user?.nama ?? "Tamu"}
            </span>
            {user && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: roleBadgeColor.bg,
                  color: roleBadgeColor.fg,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  flexShrink: 0
                }}
              >
                {roleBadgeLabel}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {user?.email ?? "—"}
          </div>
        </div>
        <LogoutButton variant="icon" />
      </div>
    </aside>
  );
}

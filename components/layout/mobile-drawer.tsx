"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navItems, visibleNavItems } from "./nav-items";
import { Logo } from "./logo";
import { LogoutButton } from "@/components/auth/logout-button";

interface MobileDrawerProps {
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

const COUNT_KEY: Record<string, "units" | "jobsActive" | "driversAvailable"> = {
  "/units": "units",
  "/jobs": "jobsActive",
  "/drivers": "driversAvailable"
};

const BADGE_KEYS = new Set(["/jobs"]);

export function MobileDrawer({ user, counts }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when open + ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Buka menu"
        onClick={() => setOpen(true)}
        className="lg:hidden btn-ghost"
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        <Menu style={{ width: 22, height: 22 }} />
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 fade-in"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "min(82vw, 320px)",
              background: "white",
              boxShadow: "0 0 40px rgba(0,0,0,0.18)",
              animation: "slideUp 220ms ease-out"
            }}
          >
            <div
              style={{
                padding: "16px 16px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8
              }}
            >
              <Logo size="md" showSub />
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
            <div className="divider" />
            <nav
              className="flex-1 overflow-y-auto scroll-region"
              style={{
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 2
              }}
            >
              <div className="eyebrow" style={{ padding: "8px 10px 6px" }}>
                Menu
              </div>
              {visibleNavItems(navItems, user?.role).map((item) => {
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
                    onClick={() => setOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 12px",
                      borderRadius: 8,
                      background: active
                        ? "var(--brand-primary-light)"
                        : "transparent",
                      color: active
                        ? "var(--brand-primary-dark)"
                        : "var(--text-primary)",
                      textDecoration: "none",
                      fontSize: 15,
                      fontWeight: active ? 600 : 500
                    }}
                  >
                    <Icon style={{ width: 20, height: 20 }} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {count != null && (
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: badge
                            ? "var(--brand-primary)"
                            : "rgba(0,0,0,0.06)",
                          color: badge ? "white" : "var(--text-secondary)",
                          minWidth: 22,
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
            {user && (
              <>
                <div className="divider" />
                <div
                  style={{
                    padding: "14px 14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 99,
                      background: "var(--brand-primary)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 13,
                      flexShrink: 0
                    }}
                  >
                    {user.initials}
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
                          fontSize: 14,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0
                        }}
                      >
                        {user.nama}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background:
                            user.role === "operator"
                              ? "#fff4e0"
                              : "var(--brand-primary-light)",
                          color:
                            user.role === "operator"
                              ? "#8a5a00"
                              : "var(--brand-primary-dark)",
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          flexShrink: 0
                        }}
                      >
                        {user.role === "operator" ? "Operator" : "Owner"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-tertiary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {user.email}
                    </div>
                  </div>
                  <LogoutButton variant="icon" />
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

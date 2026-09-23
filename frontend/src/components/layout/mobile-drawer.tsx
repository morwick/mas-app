import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import {
  isNavGroup,
  navTree,
  profileItem,
  visibleNavTree,
  type NavItem
} from "./nav-items";
import { Logo } from "./logo";

interface MobileDrawerProps {
  user: {
    nama: string;
    email: string;
    initials: string;
    role?: "superadmin" | "operator";
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
  const { pathname } = useLocation();

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

  function renderItem(item: NavItem, nested = false) {
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
        to={item.href}
        onClick={() => setOpen(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: nested ? "11px 12px 11px 14px" : "11px 12px",
          // Submenu diberi garis & indentasi: tanpa ini item tingkat atas
          // sesudah grup (Laporan) terbaca seolah bagian dari grup itu.
          marginLeft: nested ? 12 : 0,
          borderLeft: nested ? "1.5px solid var(--border-default)" : undefined,
          borderRadius: nested ? "0 8px 8px 0" : 8,
          background: active ? "var(--brand-primary-light)" : "transparent",
          borderLeftColor: nested && active ? "var(--brand-primary)" : undefined,
          color: active ? "var(--brand-primary-dark)" : "var(--text-primary)",
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
              background: badge ? "var(--brand-primary)" : "rgba(0,0,0,0.06)",
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
  }

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
              {visibleNavTree(navTree, user?.role).map((entry) =>
                isNavGroup(entry) ? (
                  <div key={entry.key} style={{ display: "contents" }}>
                    {/* Di laci mobile grup jadi label seksi, bukan tombol
                        lipat — isinya langsung terlihat tanpa tap tambahan. */}
                    <div
                      className="eyebrow"
                      style={{ padding: "14px 12px 4px" }}
                    >
                      {entry.label}
                    </div>
                    {entry.items.map((item) => renderItem(item, true))}
                  </div>
                ) : (
                  renderItem(entry)
                )
              )}
              <div className="divider" style={{ margin: "10px 0" }} />
              {renderItem(profileItem)}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

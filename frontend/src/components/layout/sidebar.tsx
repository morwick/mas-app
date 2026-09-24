import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Logo } from "./logo";
import {
  groupHasActive,
  isNavGroup,
  navTree,
  visibleNavTree,
  type NavItem
} from "./nav-items";

interface SidebarProps {
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

const COUNT_KEY: Record<string, keyof NonNullable<SidebarProps["counts"]>> = {
  "/units": "units",
  "/jobs": "jobsActive",
  "/drivers": "driversAvailable"
};

const BADGE_KEYS = new Set(["/jobs"]);

export function Sidebar({ user, counts }: SidebarProps) {
  const { pathname } = useLocation();
  const entries = visibleNavTree(navTree, user?.role);
  // Semua grup terbuka secara default; yang ditutup manual disimpan di sini.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Satu baris tautan; `nested` dipakai untuk submenu di dalam grup. */
  function renderItem(item: NavItem, nested: boolean) {
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: nested ? "7px 10px 7px 12px" : "8px 10px",
          marginLeft: nested ? 12 : 0,
          borderLeft: nested ? "1.5px solid var(--border-default)" : undefined,
          borderRadius: nested ? "0 8px 8px 0" : 8,
          background: active ? "var(--brand-primary-light)" : "transparent",
          borderLeftColor: nested && active ? "var(--brand-primary)" : undefined,
          color: active ? "var(--brand-primary-dark)" : "var(--text-primary)",
          textDecoration: "none",
          fontSize: nested ? 13 : 13.5,
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
        <Icon style={{ width: nested ? 16 : 18, height: nested ? 16 : 18 }} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {count != null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "1px 7px",
              borderRadius: 99,
              background: badge ? "var(--brand-primary)" : "rgba(0,0,0,0.06)",
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
  }

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
        {entries.map((entry) => {
          if (!isNavGroup(entry)) return renderItem(entry, false);

          const hasActive = groupHasActive(entry, pathname);
          // Submenu yang sedang aktif memaksa induknya terbuka, supaya
          // halaman yang dibuka tidak tersembunyi di balik grup tertutup.
          const open = !collapsed.has(entry.key) || hasActive;
          const GroupIcon = entry.icon;
          return (
            <div key={entry.key} style={{ display: "contents" }}>
              <button
                type="button"
                onClick={() => toggle(entry.key)}
                aria-expanded={open}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  marginTop: 6,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: hasActive
                    ? "var(--brand-primary-dark)"
                    : "var(--text-primary)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-muted)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <GroupIcon style={{ width: 18, height: 18 }} />
                <span style={{ flex: 1 }}>{entry.label}</span>
                <ChevronDown
                  style={{
                    width: 15,
                    height: 15,
                    color: "var(--text-tertiary)",
                    transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 150ms ease"
                  }}
                />
              </button>
              {open && entry.items.map((item) => renderItem(item, true))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Logo } from "./logo";
import {
  groupHasActive,
  isNavGroup,
  navTree,
  sisipkanGrupApproval,
  visibleNavTree,
  type NavGroup,
  type NavItem,
  type UserRoleLike
} from "./nav-items";

interface SidebarProps {
  user: {
    nama: string;
    email: string;
    initials: string;
    role?: UserRoleLike;
  } | null;
  counts?: {
    units?: number;
    jobsActive?: number;
    driversAvailable?: number;
  };
  /** Dilipat lewat tombol di top bar (desktop): hanya ikon yang tampil. */
  mini?: boolean;
  /** Grup Approval milik pengguna ini (dibuat dari fitur yang ia pegang). */
  approval?: NavGroup | null;
}

const COUNT_KEY: Record<string, keyof NonNullable<SidebarProps["counts"]>> = {
  "/units": "units",
  "/jobs": "jobsActive",
  "/drivers": "driversAvailable"
};

const BADGE_KEYS = new Set(["/jobs"]);

/** Lebar menu terlipat (hanya ikon). */
const LEBAR_MINI = 64;

export function Sidebar({ user, counts, mini = false, approval }: SidebarProps) {
  const { pathname } = useLocation();
  const entries = sisipkanGrupApproval(visibleNavTree(navTree, user?.role), approval);
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
    // Angka tindakan menunggu (Approval) memakai gaya badge yang sama dengan Job aktif.
    const count = countKey ? counts?.[countKey] : item.badge ? item.badge : undefined;
    const badge = BADGE_KEYS.has(item.href) || Boolean(item.badge);
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

  /** Mode terlipat: satu ikon per menu, nama sebagai tooltip. */
  function renderIkon(item: NavItem) {
    const active = item.match ? item.match(pathname) : pathname.startsWith(item.href);
    const Icon = item.icon;
    const countKey = COUNT_KEY[item.href];
    const count = countKey ? counts?.[countKey] : item.badge;
    const badge = (BADGE_KEYS.has(item.href) || Boolean(item.badge)) && count != null && count > 0;
    return (
      <Link
        key={item.href}
        to={item.href}
        title={item.label}
        aria-label={item.label}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 38,
          margin: "0 auto",
          borderRadius: 8,
          background: active ? "var(--brand-primary-light)" : "transparent",
          color: active ? "var(--brand-primary-dark)" : "var(--text-secondary)",
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
        {badge && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              width: 8,
              height: 8,
              borderRadius: 99,
              background: "var(--brand-primary)",
              border: "1.5px solid white"
            }}
          />
        )}
      </Link>
    );
  }

  return (
    <aside
      className="hidden lg:flex h-screen sticky top-0 flex-shrink-0"
      data-mini={mini}
      style={{
        width: mini ? LEBAR_MINI : "var(--sidebar-w)",
        overflow: "hidden",
        transition: "width 180ms ease",
        background: "white",
        borderRight: "0.5px solid var(--border-default)"
      }}
    >
      {mini ? (
        <div className="flex flex-col h-full" style={{ width: LEBAR_MINI, flexShrink: 0 }}>
          {/* Hanya bagian ikon dari logo. */}
          <div style={{ padding: "22px 0 16px", display: "flex", justifyContent: "center" }}>
            <div style={{ width: 34, height: 30, overflow: "hidden" }} title="MAS Group">
              <img src="/logo.png" alt="MAS Group" style={{ height: 30, width: "auto", maxWidth: "none" }} />
            </div>
          </div>
          <div className="divider" />
          <nav
            className="flex-1 overflow-y-auto scroll-region"
            aria-label="Menu"
            style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 2 }}
          >
            {entries.map((entry, idx) =>
              isNavGroup(entry) ? (
                <div key={entry.key} style={{ display: "contents" }}>
                  {/* Pemisah antar grup (Master, Monitoring, …). */}
                  <div
                    aria-hidden
                    style={{ height: 0.5, background: "var(--border-default)", margin: idx === 0 ? "0 14px 6px" : "6px 14px" }}
                  />
                  {entry.items.map(renderIkon)}
                </div>
              ) : (
                renderIkon(entry)
              )
            )}
          </nav>
        </div>
      ) : (
        <div className="flex flex-col h-full" style={{ width: "var(--sidebar-w)", flexShrink: 0 }}>
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
        </div>
      )}
    </aside>
  );
}

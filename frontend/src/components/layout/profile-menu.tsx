/**
 * Menu profil di top bar — pengganti menu "Pengaturan" yang sudah dihapus.
 * Isinya identitas yang sedang login, tautan ubah profil, dan keluar.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { profileItem } from "./nav-items";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tutup saat pindah halaman — kalau tidak, menunya menggantung terbuka.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const isSuperadmin = user.role === "superadmin";
  const roleLabel = isSuperadmin ? "Super Administrator" : "Operator";
  const roleColor = isSuperadmin
    ? { bg: "var(--brand-primary-light)", fg: "var(--brand-primary-dark)" }
    : { bg: "#fff4e0", fg: "#8a5a00" };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu profil"
        style={{
          width: 32,
          height: 32,
          borderRadius: 99,
          background: "var(--brand-primary)",
          color: "white",
          border: open ? "2px solid var(--brand-primary-dark)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0
        }}
      >
        {user.initials}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            zIndex: 40,
            width: 244,
            background: "white",
            borderRadius: 12,
            border: "0.5px solid var(--border-default)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "0.5px solid var(--border-default)"
            }}
          >
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {user.nama}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 1
              }}
            >
              {user.email}
            </div>
            <span
              style={{
                display: "inline-block",
                marginTop: 7,
                fontSize: 9.5,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                background: roleColor.bg,
                color: roleColor.fg,
                letterSpacing: 0.4,
                textTransform: "uppercase"
              }}
            >
              {roleLabel}
            </span>
          </div>

          <div style={{ padding: 4 }}>
            <Link
              to={profileItem.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 13.5
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <UserRound style={{ width: 16, height: 16 }} />
              Ubah profil
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#c13838",
                fontSize: 13.5,
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
              <LogOut style={{ width: 16, height: 16 }} />
              Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { bacaJejakAsal, susunJudul } from "./judul-halaman";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import type { AppNotification } from "@/lib/notifications";

export function TopBar({
  notifications,
  sidebarMini = false,
  onToggleSidebar
}: {
  notifications?: AppNotification[];
  sidebarMini?: boolean;
  /** Tombol lipat (hanya ikon) / buka menu kiri. */
  onToggleSidebar?: () => void;
}) {
  const { pathname, state } = useLocation();
  // Asal halaman dari link (mis. job dibuka dari detail proyek).
  const { jejak, judul } = susunJudul(pathname, bacaJejakAsal(state));

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
      {onToggleSidebar && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onToggleSidebar}
          aria-label={sidebarMini ? "Buka menu" : "Lipat menu"}
          title={sidebarMini ? "Buka menu" : "Lipat menu (hanya ikon)"}
          style={{ padding: 6, flexShrink: 0 }}
        >
          <Menu style={{ width: 18, height: 18 }} />
        </button>
      )}
      {/* Judul halaman: "Menu / Halaman" — jejak kecil (bisa diklik), judul besar. */}
      <nav aria-label="Judul halaman" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
        {jejak.map((j) => (
          <span key={j.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexShrink: 0, fontSize: 14 }}>
            {j.href ? (
              <Link to={j.href} state={state} className="judul-jejak">
                {j.label}
              </Link>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>{j.label}</span>
            )}
            <span aria-hidden style={{ color: "var(--text-tertiary)" }}>
              /
            </span>
          </span>
        ))}
        <div className="h2" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {judul}
        </div>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <GlobalSearch />
        <NotificationBell variant="desktop" notifications={notifications} />
        <ProfileMenu />
      </div>
    </header>
  );
}

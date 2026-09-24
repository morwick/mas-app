import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./logo";
import { MobileDrawer } from "./mobile-drawer";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import { navItems } from "./nav-items";
import type { AppNotification } from "@/lib/notifications";

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
  return `Detail ${root.label.toLowerCase()}`;
}

interface MobileHeaderProps {
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
  notifications?: AppNotification[];
}

export function MobileHeader({
  user,
  counts,
  notifications
}: MobileHeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isRoot = ["/dashboard"].includes(pathname);
  const title = getPageTitle(pathname);

  return (
    <header
      className="lg:hidden sticky top-0 z-30 bg-white"
      style={{ borderBottom: "0.5px solid var(--border-default)" }}
    >
      <div
        className="flex items-center justify-between"
        style={{ height: 56, padding: "0 8px 0 4px", gap: 4 }}
      >
        <div
          className="flex items-center min-w-0"
          style={{ gap: 4, flex: 1, minWidth: 0 }}
        >
          <MobileDrawer user={user} counts={counts} />
          {isRoot ? (
            <Logo size="sm" />
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate(-1)}
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
                  justifyContent: "center",
                  flexShrink: 0
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
                  whiteSpace: "nowrap",
                  minWidth: 0
                }}
              >
                {title}
              </h1>
            </>
          )}
        </div>
        {/* Menu profil ikut di top bar pada layar sempit — isinya role,
            ubah profil, dan keluar. */}
        <div className="flex items-center" style={{ flexShrink: 0, gap: 6 }}>
          <NotificationBell variant="mobile" notifications={notifications} />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

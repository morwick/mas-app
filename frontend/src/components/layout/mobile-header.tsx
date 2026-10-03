import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./logo";
import { MobileDrawer } from "./mobile-drawer";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import { bacaJejakAsal, susunJudul } from "./judul-halaman";
import { type NavGroup, type UserRoleLike } from "./nav-items";
import type { AppNotification } from "@/lib/notifications";

interface MobileHeaderProps {
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
  notifications?: AppNotification[];
  approval?: NavGroup | null;
}

export function MobileHeader({
  user,
  counts,
  notifications,
  approval
}: MobileHeaderProps) {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const isRoot = ["/dashboard"].includes(pathname);
  // Asal halaman dari link (mis. job dibuka dari detail proyek).
  const { jejak, judul } = susunJudul(pathname, bacaJejakAsal(state));

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
          <MobileDrawer user={user} counts={counts} approval={approval} />
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
              {/* Layar sempit: jejak kecil di atas judul ("Menu / Detail"). */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                {jejak.length > 0 && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-tertiary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {jejak.map((j) => (
                      <span key={j.label}>
                        {j.href ? (
                          <Link
                            to={j.href}
                            // Asal halaman ikut terbawa (mis. Detail Job tetap di bawah Detail Proyek).
                            state={state}
                            className="judul-jejak"
                          >
                            {j.label}
                          </Link>
                        ) : (
                          j.label
                        )}
                        {" / "}
                      </span>
                    ))}
                  </div>
                )}
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
                  {judul}
                </h1>
              </div>
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

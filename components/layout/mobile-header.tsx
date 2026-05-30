"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./logo";
import { MobileDrawer } from "./mobile-drawer";
import { NotificationBell } from "./notification-bell";
import { navItems } from "./nav-items";

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
  if (segments[0] === "settings" && last === "profile") return "Profil";
  if (segments[0] === "settings" && last === "jenis-unit") return "Jenis unit";
  return `Detail ${root.label.toLowerCase()}`;
}

interface MobileHeaderProps {
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

export function MobileHeader({ user, counts }: MobileHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
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
                onClick={() => router.back()}
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
        <div className="flex items-center" style={{ flexShrink: 0 }}>
          <NotificationBell variant="mobile" />
        </div>
      </div>
    </header>
  );
}

import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { useSidebarMini } from "@/components/layout/use-sidebar-mini";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { NotifikasiBaru } from "@/components/layout/notifikasi-baru";
import { CaptchaPopup } from "@/features/tracksolid/components/captcha-popup";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useLayoutCounts } from "@/features/dashboard/queries";
import { useNotifications } from "@/features/notifications/queries";
import { useMenuApproval } from "@/features/approval/queries";
import { buatGrupApproval } from "@/components/layout/nav-items";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useMemuatHalaman } from "@/lib/use-memuat-halaman";

export function AdminLayout() {
  const user = useCurrentUser();
  const [sidebarMini, toggleSidebar] = useSidebarMini();
  const countsQuery = useLayoutCounts();
  // Lonceng tidak boleh menjatuhkan halaman — backend membalas [] bila bermasalah.
  const notificationsQuery = useNotifications();

  const counts = {
    units: countsQuery.data?.units ?? 0,
    jobsActive: countsQuery.data?.jobs_active ?? 0,
    driversAvailable: countsQuery.data?.drivers_available ?? 0
  };
  const notifications = notificationsQuery.data ?? [];
  // Menu Approval hanya muncul untuk karyawan yang menjadi approver (role apa pun).
  const menuApproval = useMenuApproval();
  const approval = buatGrupApproval(menuApproval.data ?? []);
  // Popup loading global: data halaman sedang dimuat / dimuat ulang.
  const memuat = useMemuatHalaman();

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <Sidebar user={user} counts={counts} mini={sidebarMini} approval={approval} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          notifications={notifications}
          sidebarMini={sidebarMini}
          onToggleSidebar={toggleSidebar}
        />
        <MobileHeader user={user} counts={counts} notifications={notifications} approval={approval} />
        <main className="flex-1 pb-20 lg:pb-12">
          {/* Isi halaman mengikuti lebar layar (tanpa batas 1200px) supaya layar
              besar terpakai penuh; HP tetap memakai padding kecil. */}
          <div className="w-full px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
            <Outlet />
          </div>
        </main>
        <BottomNav role={user.role} />
        <NotifikasiBaru notifications={notificationsQuery.data} />
        {/* Sesi TrackSolid tidak valid → popup captcha di halaman mana pun. */}
        <CaptchaPopup />
        <LoadingOverlay message={memuat ? "Memuat data…" : null} />
      </div>
    </div>
  );
}

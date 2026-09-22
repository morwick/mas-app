import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useLayoutCounts } from "@/features/dashboard/queries";
import { useNotifications } from "@/features/notifications/queries";

export function AdminLayout() {
  const user = useCurrentUser();
  const countsQuery = useLayoutCounts();
  // Lonceng tidak boleh menjatuhkan halaman — backend membalas [] bila bermasalah.
  const notificationsQuery = useNotifications();

  const counts = {
    units: countsQuery.data?.units ?? 0,
    jobsActive: countsQuery.data?.jobs_active ?? 0,
    driversAvailable: countsQuery.data?.drivers_available ?? 0
  };
  const notifications = notificationsQuery.data ?? [];

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <Sidebar user={user} counts={counts} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar notifications={notifications} />
        <MobileHeader user={user} counts={counts} notifications={notifications} />
        <main className="flex-1 pb-20 lg:pb-12">
          <div className="mx-auto w-full max-w-page px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
            <Outlet />
          </div>
        </main>
        <BottomNav role={user.role} />
      </div>
    </div>
  );
}

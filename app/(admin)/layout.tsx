import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getCurrentUser } from "@/lib/queries/profile";
import { activeUnitsCount } from "@/lib/queries/units";
import { activeJobsCount } from "@/lib/queries/jobs";
import { activeDriversCount } from "@/lib/queries/drivers";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const [user, unitsCount, jobsCount, driversCount] = await Promise.all([
    getCurrentUser(),
    activeUnitsCount().catch(() => 0),
    activeJobsCount().catch(() => 0),
    activeDriversCount().catch(() => 0)
  ]);

  const counts = {
    units: unitsCount,
    jobsActive: jobsCount,
    driversAvailable: driversCount
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <Sidebar user={user} counts={counts} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <MobileHeader />
        <main className="flex-1 pb-20 lg:pb-12">
          <div className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

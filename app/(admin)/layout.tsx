import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getCurrentUser } from "@/lib/queries/profile";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen flex bg-page">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar user={user} />
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

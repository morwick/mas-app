import { Outlet } from "react-router-dom";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useMemuatHalaman } from "@/lib/use-memuat-halaman";

// Portal driver memakai sesi driver sendiri (lihat DriverAuthContext), bukan
// sesi admin. Layout sengaja tidak memutuskan akses — itu tugas RequireDriver.
export function DriverLayout() {
  // Popup loading global: data halaman sedang dimuat / dimuat ulang.
  const memuat = useMemuatHalaman();
  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 pb-20">
          <div className="mx-auto w-full max-w-page px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <LoadingOverlay message={memuat ? "Memuat data…" : null} />
    </div>
  );
}

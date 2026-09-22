import { Outlet } from "react-router-dom";

// Portal driver memakai sesi driver sendiri (lihat DriverAuthContext), bukan
// sesi admin. Layout sengaja tidak memutuskan akses — itu tugas RequireDriver.
export function DriverLayout() {
  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 pb-20">
          <div className="mx-auto w-full max-w-page px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

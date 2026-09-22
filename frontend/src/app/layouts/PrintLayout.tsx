import { Outlet } from "react-router-dom";

// Tanpa sidebar/topbar supaya halaman rapi untuk save as PDF / cetak A4.
export function PrintLayout() {
  return (
    <div className="min-h-screen bg-page">
      <Outlet />
    </div>
  );
}

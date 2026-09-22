import "../globals.css";

// Layout terpisah dari (admin) — tanpa sidebar/topbar supaya halaman print
// rapih untuk save as PDF / cetak ke kertas A4.
export default function PrintLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-page">{children}</div>;
}

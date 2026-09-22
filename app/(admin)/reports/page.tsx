import Link from "next/link";
import { BarChart3, Users, ArrowRight, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

const items = [
  {
    href: "/reports/utilisasi",
    title: "Utilisasi armada",
    description:
      "Persentase hari Bertugas / Standby / Perbaikan per unit untuk periode tertentu.",
    icon: BarChart3
  },
  {
    href: "/reports/laba",
    title: "Laba per job",
    description:
      "Pendapatan dari tagihan dikurangi uang jalan dan biaya insiden, per job.",
    icon: TrendingUp
  },
  {
    href: "/reports/customers",
    title: "Riwayat per customer",
    description: "Daftar job per customer dengan detail alat, unit, driver, dan status akhir.",
    icon: Users
  }
];

export default function ReportsIndexPage() {
  return (
    <div className="flex flex-col gap-4 max-w-[840px]">
      <div>
        <h1 className="text-h1">Laporan</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Analisa utilisasi armada dan riwayat kerjasama customer.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="block bg-card rounded-lg border border-border p-4 hover:border-border-hover transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
                <it.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-medium text-text">{it.title}</p>
                  <ArrowRight className="w-4 h-4 text-text-subtle" />
                </div>
                <p className="text-[12px] text-text-muted mt-0.5">{it.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

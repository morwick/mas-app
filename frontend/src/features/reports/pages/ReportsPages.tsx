import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, Users, ArrowRight, TrendingUp } from "lucide-react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useCustomers } from "@/features/customers/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useJobs } from "@/features/jobs/queries";
import { useUnits } from "@/features/units/queries";
import { useJobProfitability } from "@/features/invoices/queries";
import type { UserRole } from "@/types";
import { CustomerReportView } from "../components/customer-report-view";
import { LabaView } from "../components/laba-view";
import { UtilizationView } from "../components/utilization-view";
import { useUtilizationReport } from "../queries";

const items: {
  href: string;
  title: string;
  description: string;
  icon: typeof BarChart3;
  /** Kosong = semua role login. Operator cuma dapat Utilisasi. */
  roles?: UserRole[];
}[] = [
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
    description: "Pendapatan dari tagihan dikurangi uang jalan dan biaya insiden, per job.",
    icon: TrendingUp,
    roles: ["superadmin", "admin", "finance"]
  },
  {
    href: "/reports/customers",
    title: "Riwayat per customer",
    description: "Daftar job per customer dengan detail alat, unit, driver, dan status akhir.",
    icon: Users,
    roles: ["superadmin", "admin", "finance"]
  }
];

export function ReportsIndexPage() {
  const user = useCurrentUser();
  const visible = items.filter((it) => !it.roles || it.roles.includes(user.role));
  return (
    <div className="flex flex-col gap-4 max-w-[840px]">
      <div>
        <h1 className="text-h1">Laporan</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Analisa utilisasi armada dan riwayat kerjasama customer.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((it) => (
          <Link
            key={it.href}
            to={it.href}
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

type Period = "month_now" | "month_prev" | "custom";

function computeRange(period: Period, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(to) };
  }
  if (period === "month_prev") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1)
    };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
}

export function UtilisasiReportPage() {
  const [sp] = useSearchParams();
  const period = (sp.get("period") as Period | null) ?? "month_now";
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const { start, end } = useMemo(() => computeRange(period, from, to), [period, from, to]);
  const rows = useUtilizationReport(start.toISOString(), end.toISOString());

  if (rows.isPending) return <PageLoading />;
  if (rows.isError) return <PageError error={rows.error} onRetry={rows.refetch} />;
  return (
    <UtilizationView
      rows={rows.data}
      period={period}
      from={from}
      to={to}
      rangeStart={start.toISOString()}
      rangeEnd={end.toISOString()}
    />
  );
}

/** Default: bulan berjalan. Rentang lain diatur lewat form di halaman. */
function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

export function LabaReportPage() {
  const [sp] = useSearchParams();
  const def = defaultRange();
  const start = sp.get("start") || def.start;
  const end = sp.get("end") || def.end;
  const rows = useJobProfitability(start, end);

  if (rows.isPending) return <PageLoading />;
  if (rows.isError) return <PageError error={rows.error} onRetry={rows.refetch} />;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Laba per job</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Pendapatan dari tagihan dikurangi uang jalan dan biaya insiden.
        </p>
      </div>
      <LabaView rows={rows.data} start={start} end={end} />
    </div>
  );
}

export function CustomersReportPage() {
  const [sp] = useSearchParams();
  const customerId = sp.get("customer") ?? "";
  const period = sp.get("period") ?? "all";

  const customers = useCustomers(true);
  const jobs = useJobs({ customerId: customerId || undefined });
  const units = useUnits(true);
  const drivers = useDrivers(true);

  const unitMap = useMemo(
    () =>
      Object.fromEntries(
        (units.data ?? []).map((u) => [u.id, { kode_unit: u.kode_unit, jenis: u.jenis_unit_nama }])
      ),
    [units.data]
  );
  const driverMap = useMemo(
    () => Object.fromEntries((drivers.data ?? []).map((d) => [d.id, d.nama])),
    [drivers.data]
  );

  if (jobs.isPending || customers.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  return (
    <CustomerReportView
      jobs={jobs.data}
      customers={customers.data ?? []}
      unitMap={unitMap}
      driverMap={driverMap}
      customerId={customerId}
      period={period}
    />
  );
}

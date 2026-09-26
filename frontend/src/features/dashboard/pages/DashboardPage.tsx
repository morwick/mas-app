import { useEffect } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { sinkronOdometer } from "@/features/services/api";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { DashboardView } from "../components/dashboard-view";
import { FinanceDashboardView } from "../components/finance-dashboard-view";
import { useDashboard, useFinanceDashboard } from "../queries";

/** Sama dengan menu Service: odometer GPS disinkron (maks. sekali / 5 menit
 * untuk seluruh aplikasi), lalu dashboard disegarkan — angka service di
 * "Perlu tindakan" jadi sama dengan menu Service. */
const SINKRON_ODOMETER_MS = 5 * 60_000;

function OperationalDashboardPage() {
  const q = useDashboard();
  useEffect(() => {
    const sinkron = () => void sinkronOdometer().catch(() => undefined);
    sinkron();
    const id = window.setInterval(sinkron, SINKRON_ODOMETER_MS);
    return () => window.clearInterval(id);
  }, []);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  const activeJobs = q.data.active_jobs.map((e) => ({ unitId: e.unit_id, job: e.job }));
  return (
    <DashboardView
      units={q.data.units}
      counts={q.data.counts}
      activeJobs={activeJobs}
      jobsMenungguValidasi={q.data.jobs_menunggu_validasi}
      uangJalanDiajukan={q.data.uang_jalan_diajukan}
      jobBelumKonfirmasi={q.data.job_belum_konfirmasi}
      jobsBelumInvoice={q.data.jobs_belum_invoice}
      dokumenJatuhTempo={q.data.dokumen_jatuh_tempo}
      monitoringServis={q.data.monitoring_servis}
      penawaranDealTanpaJob={q.data.penawaran_deal_tanpa_job ?? 0}
      penawaranAkanKedaluwarsa={q.data.penawaran_akan_kedaluwarsa ?? 0}
    />
  );
}

function FinanceDashboardPage() {
  const q = useFinanceDashboard();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <FinanceDashboardView data={q.data} />;
}

export function DashboardPage() {
  const user = useCurrentUser();
  return user.role === "finance" ? <FinanceDashboardPage /> : <OperationalDashboardPage />;
}

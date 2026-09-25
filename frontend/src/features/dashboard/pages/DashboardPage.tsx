import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { DashboardView } from "../components/dashboard-view";
import { FinanceDashboardView } from "../components/finance-dashboard-view";
import { useDashboard, useFinanceDashboard } from "../queries";

function OperationalDashboardPage() {
  const q = useDashboard();
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

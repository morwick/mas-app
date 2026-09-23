import { PageError, PageLoading } from "@/components/ui/page-state";
import { DashboardView } from "../components/dashboard-view";
import { useDashboard } from "../queries";

export function DashboardPage() {
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
    />
  );
}

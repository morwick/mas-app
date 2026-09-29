import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDriverAssignments } from "@/features/units/queries";
import { DriverDetailView } from "../components/driver-detail-view";
import { useDriver, useDriverJobs } from "../queries";

export function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const driver = useDriver(id);
  const jobs = useDriverJobs(id);
  const assignments = useDriverAssignments();

  if (driver.isPending) return <PageLoading />;
  if (driver.isError) return <PageError error={driver.error} onRetry={driver.refetch} />;
  return (
    <DriverDetailView
      driver={driver.data}
      jobs={jobs.data ?? []}
      unitTetap={assignments.data?.[driver.data.id] ?? null}
    />
  );
}

import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDrivers } from "@/features/drivers/queries";
import { useUnits } from "@/features/units/queries";
import { EditJobView } from "../components/edit-job-view";
import { useJob, useJobs } from "../queries";

// Job baru dibuat lewat form proyek (features/proyek/pages/ProyekFormPages.tsx).

export function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const job = useJob(id);
  const drivers = useDrivers(true);
  const units = useUnits(true);
  const activeJobs = useJobs({ status: "active" });

  if (
    job.isPending ||
    drivers.isPending ||
    units.isPending ||
    activeJobs.isPending
  )
    return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  const error = drivers.error ?? units.error;
  if (error) return <PageError error={error} />;

  return (
    <EditJobView
      job={job.data}
      drivers={drivers.data ?? []}
      units={units.data ?? []}
      activeJobs={activeJobs.data ?? []}
      conflictCheckError={activeJobs.isError}
      onRetryConflictCheck={() => void activeJobs.refetch()}
    />
  );
}

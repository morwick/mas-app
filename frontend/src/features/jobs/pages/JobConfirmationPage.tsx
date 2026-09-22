import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDriver } from "@/features/drivers/queries";
import { JobConfirmationView } from "../components/job-confirmation-view";
import { useJob } from "../queries";

export function JobConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const job = useJob(id);
  const driver = useDriver(job.data?.driver_id);
  if (job.isPending) return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  return (
    <JobConfirmationView
      job={job.data}
      driverNama={driver.data?.nama ?? "—"}
      driverNoHp={driver.data?.no_hp ?? "—"}
    />
  );
}

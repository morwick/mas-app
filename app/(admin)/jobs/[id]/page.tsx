import { notFound } from "next/navigation";
import { getJob, getJobStatusHistory } from "@/lib/queries/jobs";
import { getDriver } from "@/lib/queries/drivers";
import { getUnit } from "@/lib/queries/units";
import { JobDetailView } from "@/components/jobs/job-detail-view";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return notFound();
  const [unit, driver, history] = await Promise.all([
    getUnit(job.unit_id),
    getDriver(job.driver_id),
    getJobStatusHistory(job.id)
  ]);
  return (
    <JobDetailView
      job={job}
      unit={unit}
      driver={driver}
      history={history}
    />
  );
}

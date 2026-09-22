import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries/jobs";
import { getDriver } from "@/lib/queries/drivers";
import { JobConfirmationView } from "@/components/jobs/job-confirmation-view";

export const dynamic = "force-dynamic";

export default async function JobConfirmationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return notFound();
  const driver = await getDriver(job.driver_id);
  return (
    <JobConfirmationView
      job={job}
      driverNama={driver?.nama ?? "—"}
      driverNoHp={driver?.no_hp ?? "—"}
    />
  );
}

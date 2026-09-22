import { notFound } from "next/navigation";
import { getJob, listJobs } from "@/lib/queries/jobs";
import { listCustomers } from "@/lib/queries/customers";
import { listDrivers } from "@/lib/queries/drivers";
import { listUnits } from "@/lib/queries/units";
import { EditJobView } from "@/components/jobs/edit-job-view";

export const dynamic = "force-dynamic";

export default async function EditJobPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, customers, drivers, units, activeJobs] = await Promise.all([
    getJob(id),
    listCustomers({ includeInactive: true }),
    listDrivers({ includeInactive: true }),
    listUnits({ includeInactive: true }),
    listJobs({ status: "active" })
  ]);
  if (!job) return notFound();
  return (
    <EditJobView
      job={job}
      customers={customers}
      drivers={drivers}
      units={units}
      activeJobs={activeJobs}
    />
  );
}

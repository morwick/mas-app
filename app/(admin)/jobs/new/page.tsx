import { listCustomers } from "@/lib/queries/customers";
import { listDrivers } from "@/lib/queries/drivers";
import { listUnits } from "@/lib/queries/units";
import { listJobs } from "@/lib/queries/jobs";
import { NewJobView } from "@/components/jobs/new-job-view";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const [customers, drivers, units, activeJobs] = await Promise.all([
    listCustomers(),
    listDrivers(),
    listUnits(),
    listJobs({ status: "active" })
  ]);
  return (
    <NewJobView
      customers={customers}
      drivers={drivers}
      standbyUnits={units.filter((u) => u.status === "standby")}
      activeJobs={activeJobs}
    />
  );
}

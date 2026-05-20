import { listCustomers } from "@/lib/queries/customers";
import { listDrivers } from "@/lib/queries/drivers";
import { listUnits } from "@/lib/queries/units";
import { listJobs } from "@/lib/queries/jobs";
import { JobsListView } from "@/components/jobs/jobs-list-view";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const [jobs, customers, units, drivers] = await Promise.all([
    listJobs(),
    listCustomers({ includeInactive: true }),
    listUnits({ includeInactive: true }),
    listDrivers({ includeInactive: true })
  ]);
  const unitMap = Object.fromEntries(
    units.map((u) => [u.id, { kode_unit: u.kode_unit, jenis: u.jenis_unit_nama }])
  );
  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.nama]));
  return (
    <JobsListView
      jobs={jobs}
      customers={customers}
      unitMap={unitMap}
      driverMap={driverMap}
    />
  );
}

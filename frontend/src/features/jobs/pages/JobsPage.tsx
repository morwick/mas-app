import { useMemo } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCustomers } from "@/features/customers/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useUnits } from "@/features/units/queries";
import { JobsListView } from "../components/jobs-list-view";
import { useJobs } from "../queries";

export function JobsPage() {
  const jobs = useJobs();
  const customers = useCustomers(true);
  const units = useUnits(true);
  const drivers = useDrivers(true);

  const unitMap = useMemo(
    () =>
      Object.fromEntries(
        (units.data ?? []).map((u) => [u.id, { kode_unit: u.kode_unit, jenis: u.jenis_unit_nama }])
      ),
    [units.data]
  );
  const driverMap = useMemo(
    () => Object.fromEntries((drivers.data ?? []).map((d) => [d.id, d.nama])),
    [drivers.data]
  );

  if (jobs.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  return (
    <JobsListView
      jobs={jobs.data}
      customers={customers.data ?? []}
      unitMap={unitMap}
      driverMap={driverMap}
    />
  );
}

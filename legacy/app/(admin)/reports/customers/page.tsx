import { listCustomers } from "@/lib/queries/customers";
import { listJobs } from "@/lib/queries/jobs";
import { listUnits } from "@/lib/queries/units";
import { listDrivers } from "@/lib/queries/drivers";
import { CustomerReportView } from "@/components/reports/customer-report-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ customer?: string; period?: string }>;
}

export default async function CustomersReportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [customers, jobs, units, drivers] = await Promise.all([
    listCustomers({ includeInactive: true }),
    listJobs({ customerId: sp.customer || undefined }),
    listUnits({ includeInactive: true }),
    listDrivers({ includeInactive: true })
  ]);
  const unitMap = Object.fromEntries(
    units.map((u) => [u.id, { kode_unit: u.kode_unit, jenis: u.jenis_unit_nama }])
  );
  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.nama]));
  return (
    <CustomerReportView
      jobs={jobs}
      customers={customers}
      unitMap={unitMap}
      driverMap={driverMap}
      customerId={sp.customer ?? ""}
      period={sp.period ?? "all"}
    />
  );
}

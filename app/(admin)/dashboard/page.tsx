import { listUnits, unitStatusCounts } from "@/lib/queries/units";
import { getActiveJobsByUnit } from "@/lib/queries/jobs";
import { listDrivers } from "@/lib/queries/drivers";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [units, counts, activeJobs, drivers] = await Promise.all([
    listUnits(),
    unitStatusCounts(),
    getActiveJobsByUnit(),
    listDrivers()
  ]);
  const driverMap = new Map(drivers.map((d) => [d.id, d.nama]));
  const activeJobsArr = Array.from(activeJobs.entries()).map(([unitId, job]) => ({
    unitId,
    job: {
      id: job.id,
      job_number: job.job_number,
      asal: job.asal,
      tujuan: job.tujuan,
      driver_nama: driverMap.get(job.driver_id) ?? "—"
    }
  }));

  return (
    <DashboardView
      units={units}
      counts={counts}
      activeJobs={activeJobsArr}
    />
  );
}

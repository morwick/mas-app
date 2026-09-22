import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { listDrivers } from "@/lib/queries/drivers";
import { getDriverAssignments } from "@/lib/queries/units";
import { UnitForm } from "@/components/units/unit-form";

export const dynamic = "force-dynamic";

export default async function NewUnitPage() {
  const [jenis, drivers, driverAssignments] = await Promise.all([
    listJenisUnit(),
    listDrivers(),
    getDriverAssignments()
  ]);
  return (
    <UnitForm
      mode="new"
      jenisUnitList={jenis}
      drivers={drivers}
      driverAssignments={driverAssignments}
    />
  );
}

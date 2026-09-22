import { listUnits } from "@/lib/queries/units";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { listLastServiceOdometerMap } from "@/lib/queries/services";
import { ServicesListView } from "@/components/services/services-list-view";
import type { UnitWithService } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ServicesListPage() {
  const [units, jenisUnit] = await Promise.all([
    listUnits({ includeInactive: false }),
    listJenisUnit()
  ]);

  const lastMap = await listLastServiceOdometerMap(units.map((u) => u.id));

  const enriched: UnitWithService[] = units.map((u) => ({
    ...u,
    last_service_odometer_km: lastMap.get(u.id) ?? null
  }));

  return <ServicesListView units={enriched} jenisUnitList={jenisUnit} />;
}

import { listUnits } from "@/lib/queries/units";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { UnitsListView } from "@/components/units/units-list-view";

export const dynamic = "force-dynamic";

export default async function UnitsListPage() {
  const [units, jenisUnit] = await Promise.all([
    listUnits({ includeInactive: true }),
    listJenisUnit()
  ]);
  return <UnitsListView units={units} jenisUnitList={jenisUnit} />;
}

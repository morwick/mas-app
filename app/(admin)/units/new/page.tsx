import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { listDrivers } from "@/lib/queries/drivers";
import { UnitForm } from "@/components/units/unit-form";

export const dynamic = "force-dynamic";

export default async function NewUnitPage() {
  const [jenis, drivers] = await Promise.all([listJenisUnit(), listDrivers()]);
  return <UnitForm mode="new" jenisUnitList={jenis} drivers={drivers} />;
}

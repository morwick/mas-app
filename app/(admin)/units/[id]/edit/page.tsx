import { notFound } from "next/navigation";
import { getUnit } from "@/lib/queries/units";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { listDrivers } from "@/lib/queries/drivers";
import { UnitForm } from "@/components/units/unit-form";

export const dynamic = "force-dynamic";

export default async function EditUnitPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [unit, jenis, drivers] = await Promise.all([
    getUnit(id),
    listJenisUnit(),
    listDrivers()
  ]);
  if (!unit) return notFound();
  return (
    <UnitForm mode="edit" initial={unit} jenisUnitList={jenis} drivers={drivers} />
  );
}

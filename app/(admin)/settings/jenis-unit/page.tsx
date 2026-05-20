import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { JenisUnitView } from "@/components/settings/jenis-unit-view";

export const dynamic = "force-dynamic";

export default async function JenisUnitPage() {
  const list = await listJenisUnit();
  return <JenisUnitView list={list} />;
}

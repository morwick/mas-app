import { PageError, PageLoading } from "@/components/ui/page-state";
import { useJenisUnit } from "@/features/settings/queries";
import { UnitsListView } from "../components/units-list-view";
import { useUnits } from "../queries";

export function UnitsPage() {
  const units = useUnits(true);
  const jenis = useJenisUnit();
  if (units.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return <UnitsListView units={units.data} jenisUnitList={jenis.data ?? []} />;
}

import { PageError, PageLoading } from "@/components/ui/page-state";
import { useJenisUnit } from "@/features/settings/queries";
import { ServicesListView } from "../components/services-list-view";
import { useUnitsWithService } from "../queries";

export function ServicesPage() {
  const units = useUnitsWithService();
  const jenis = useJenisUnit();
  if (units.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return <ServicesListView units={units.data} jenisUnitList={jenis.data ?? []} />;
}

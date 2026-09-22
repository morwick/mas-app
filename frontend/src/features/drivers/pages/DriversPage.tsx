import { PageError, PageLoading } from "@/components/ui/page-state";
import { DriversListView } from "../components/drivers-list-view";
import { useDrivers } from "../queries";

export function DriversPage() {
  const q = useDrivers(true);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <DriversListView drivers={q.data} />;
}

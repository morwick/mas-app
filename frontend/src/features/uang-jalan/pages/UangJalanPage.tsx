import { PageError, PageLoading } from "@/components/ui/page-state";
import { UangJalanListView } from "../components/uang-jalan-list-view";
import { useJobUangJalanRows } from "../queries";

export function UangJalanPage() {
  const q = useJobUangJalanRows();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <UangJalanListView rows={q.data} />;
}

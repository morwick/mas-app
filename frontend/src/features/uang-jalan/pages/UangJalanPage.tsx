import { PageError, PageLoading } from "@/components/ui/page-state";
import { UangJalanListView } from "../components/uang-jalan-list-view";
import { useJobUangJalanRows, usePendingRequests } from "../queries";

export function UangJalanPage() {
  const q = useJobUangJalanRows();
  const pengajuan = usePendingRequests();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <UangJalanListView rows={q.data} pengajuan={pengajuan.data ?? []} />;
}

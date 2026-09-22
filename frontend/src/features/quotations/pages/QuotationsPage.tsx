import { PageError, PageLoading } from "@/components/ui/page-state";
import { QuotationsListView } from "../components/quotations-list-view";
import { useQuotations } from "../queries";

export function QuotationsPage() {
  const q = useQuotations();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <QuotationsListView quotations={q.data} />;
}

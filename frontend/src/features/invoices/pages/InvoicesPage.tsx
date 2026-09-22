import { PageError, PageLoading } from "@/components/ui/page-state";
import { InvoicesListView } from "../components/invoices-list-view";
import { useInvoices } from "../queries";

export function InvoicesPage() {
  const q = useInvoices();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <InvoicesListView invoices={q.data} />;
}

import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { InvoicePrintView } from "../components/invoice-print-view";
import { useInvoice } from "../queries";

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useInvoice(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <InvoicePrintView invoice={q.data} />;
}

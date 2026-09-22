import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { QuotationPrintView } from "../components/quotation-print-view";
import { useQuotation } from "../queries";

export function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuotation(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <QuotationPrintView quotation={q.data} />;
}

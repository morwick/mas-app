import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useSumberDana } from "@/features/uang-jalan/queries";
import { InvoiceDetailView } from "../components/invoice-detail-view";
import { useInvoice } from "../queries";

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useInvoice(id);
  const sumberDana = useSumberDana();
  if (invoice.isPending) return <PageLoading />;
  if (invoice.isError) return <PageError error={invoice.error} onRetry={invoice.refetch} />;
  return <InvoiceDetailView invoice={invoice.data} sumberDana={sumberDana.data ?? []} />;
}

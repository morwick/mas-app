import { useSearchParams } from "react-router-dom";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCustomers } from "@/features/customers/queries";
import { QuotationsListView } from "../components/quotations-list-view";
import { useQuotations } from "../queries";

export function QuotationsPage() {
  const [searchParams] = useSearchParams();
  const hanyaLihat = useCurrentUser().role === "finance";
  const q = useQuotations();
  const customers = useCustomers(true);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return (
    <QuotationsListView
      quotations={q.data}
      customers={customers.data ?? []}
      initialCustomerId={searchParams.get("customer_id") ?? undefined}
      initialFilter={searchParams.get("filter") ?? undefined}
      hanyaLihat={hanyaLihat}
    />
  );
}

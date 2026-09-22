import { PageError, PageLoading } from "@/components/ui/page-state";
import { CustomersListView } from "../components/customers-list-view";
import { useCustomerJobCounts, useCustomers } from "../queries";

export function CustomersPage() {
  const customers = useCustomers(true);
  const counts = useCustomerJobCounts();
  if (customers.isPending) return <PageLoading />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  return <CustomersListView customers={customers.data} jobCounts={counts.data ?? {}} />;
}

import { PageError, PageLoading } from "@/components/ui/page-state";
import { CustomersListView } from "../components/customers-list-view";
import { useCustomerJobCounts, useCustomerQuotationCounts, useCustomers } from "../queries";

export function CustomersPage() {
  const customers = useCustomers(true);
  const jobCounts = useCustomerJobCounts();
  const quotationCounts = useCustomerQuotationCounts();
  if (customers.isPending) return <PageLoading />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  return (
    <CustomersListView
      customers={customers.data}
      jobCounts={jobCounts.data ?? {}}
      quotationCounts={quotationCounts.data ?? {}}
    />
  );
}

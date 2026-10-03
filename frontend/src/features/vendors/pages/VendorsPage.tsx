import { PageError, PageLoading } from "@/components/ui/page-state";
import { VendorsListView } from "../components/vendors-list-view";
import { useVendors } from "../queries";

export function VendorsPage() {
  const vendors = useVendors(true);
  if (vendors.isPending) return <PageLoading />;
  if (vendors.isError) return <PageError error={vendors.error} onRetry={vendors.refetch} />;
  return <VendorsListView vendors={vendors.data} />;
}

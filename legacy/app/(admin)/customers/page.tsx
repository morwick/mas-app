import { listCustomers, countJobsByCustomer } from "@/lib/queries/customers";
import { CustomersListView } from "@/components/customers/customers-list-view";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customers, counts] = await Promise.all([
    listCustomers({ includeInactive: true }),
    countJobsByCustomer()
  ]);
  return (
    <CustomersListView
      customers={customers}
      jobCounts={Object.fromEntries(counts.entries())}
    />
  );
}

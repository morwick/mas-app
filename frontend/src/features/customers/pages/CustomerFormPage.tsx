import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { CustomerForm } from "../components/customer-form";
import { useCustomer } from "../queries";

export function NewCustomerPage() {
  return <CustomerForm mode="new" />;
}

export function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const q = useCustomer(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <CustomerForm mode="edit" initial={q.data} />;
}

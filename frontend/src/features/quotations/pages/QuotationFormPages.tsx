import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useCustomers } from "@/features/customers/queries";
import { QuotationForm } from "../components/quotation-form";
import { useNextQuotationNumber, useQuotation } from "../queries";

export function NewQuotationPage() {
  const user = useCurrentUser();
  const customers = useCustomers();
  const nextNumber = useNextQuotationNumber();
  if (customers.isPending || nextNumber.isPending) return <PageLoading />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  return (
    <QuotationForm
      customers={customers.data}
      nextNumber={nextNumber.data ?? ""}
      defaultTtdNama={user.nama}
    />
  );
}

export function EditQuotationPage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const quotation = useQuotation(id);
  const customers = useCustomers(true);
  if (quotation.isPending || customers.isPending) return <PageLoading />;
  if (quotation.isError) return <PageError error={quotation.error} onRetry={quotation.refetch} />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  return (
    <QuotationForm customers={customers.data} quotation={quotation.data} defaultTtdNama={user.nama} />
  );
}

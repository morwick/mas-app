import { notFound } from "next/navigation";
import { getQuotation } from "@/lib/queries/quotations";
import { listCustomers } from "@/lib/queries/customers";
import { getCurrentUser } from "@/lib/queries/profile";
import { QuotationForm } from "@/components/quotations/quotation-form";

export const dynamic = "force-dynamic";

export default async function EditQuotationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quotation, customers, user] = await Promise.all([
    getQuotation(id),
    listCustomers({ includeInactive: true }),
    getCurrentUser()
  ]);
  if (!quotation) return notFound();

  return (
    <QuotationForm
      customers={customers}
      quotation={quotation}
      defaultTtdNama={user?.nama ?? ""}
    />
  );
}

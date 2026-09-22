import { listCustomers } from "@/lib/queries/customers";
import { peekNextQuotationNumber } from "@/lib/queries/quotations";
import { getCurrentUser } from "@/lib/queries/profile";
import { QuotationForm } from "@/components/quotations/quotation-form";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const [customers, nextNumber, user] = await Promise.all([
    listCustomers(),
    peekNextQuotationNumber(),
    getCurrentUser()
  ]);

  return (
    <QuotationForm
      customers={customers}
      nextNumber={nextNumber}
      defaultTtdNama={user?.nama ?? ""}
    />
  );
}

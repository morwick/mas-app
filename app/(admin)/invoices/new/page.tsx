import { listCustomers } from "@/lib/queries/customers";
import {
  listJobsBelumDitagihPerCustomer,
  peekNextInvoiceNumber
} from "@/lib/queries/invoices";
import { getCurrentUser } from "@/lib/queries/profile";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const [customers, nextNumber, user, jobsPerCustomer] = await Promise.all([
    listCustomers(),
    peekNextInvoiceNumber(),
    getCurrentUser(),
    listJobsBelumDitagihPerCustomer()
  ]);

  return (
    <InvoiceForm
      customers={customers}
      nextNumber={nextNumber}
      defaultTtdNama={user?.nama ?? ""}
      jobsPerCustomer={jobsPerCustomer}
    />
  );
}

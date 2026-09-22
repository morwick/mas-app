import { notFound } from "next/navigation";
import {
  getInvoice,
  listJobsBelumDitagihPerCustomer
} from "@/lib/queries/invoices";
import { listCustomers } from "@/lib/queries/customers";
import { getCurrentUser } from "@/lib/queries/profile";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, customers, user] = await Promise.all([
    getInvoice(id),
    listCustomers({ includeInactive: true }),
    getCurrentUser()
  ]);
  if (!invoice) return notFound();

  // Saat edit, customer-nya sudah pasti — cukup job milik dia saja.
  const jobsPerCustomer = await listJobsBelumDitagihPerCustomer(
    invoice.customer_id
  );

  return (
    <InvoiceForm
      customers={customers}
      invoice={invoice}
      defaultTtdNama={user?.nama ?? ""}
      jobsPerCustomer={jobsPerCustomer}
    />
  );
}

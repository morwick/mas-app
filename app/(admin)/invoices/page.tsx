import { listInvoices } from "@/lib/queries/invoices";
import { InvoicesListView } from "@/components/invoices/invoices-list-view";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return <InvoicesListView invoices={invoices} />;
}

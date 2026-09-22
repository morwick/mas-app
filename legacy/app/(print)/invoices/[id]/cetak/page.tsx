import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/queries/invoices";
import { InvoicePrintView } from "@/components/invoices/invoice-print-view";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return notFound();
  return <InvoicePrintView invoice={invoice} />;
}

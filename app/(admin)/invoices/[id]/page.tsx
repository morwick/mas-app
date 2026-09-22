import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/queries/invoices";
import { listSumberDana } from "@/lib/queries/uang-jalan";
import { InvoiceDetailView } from "@/components/invoices/invoice-detail-view";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, sumberDana] = await Promise.all([
    getInvoice(id),
    listSumberDana()
  ]);
  if (!invoice) return notFound();

  return <InvoiceDetailView invoice={invoice} sumberDana={sumberDana} />;
}

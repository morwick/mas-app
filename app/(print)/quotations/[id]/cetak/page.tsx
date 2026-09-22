import { notFound } from "next/navigation";
import { getQuotation } from "@/lib/queries/quotations";
import { QuotationPrintView } from "@/components/quotations/quotation-print-view";

export const dynamic = "force-dynamic";

export default async function QuotationPrintPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quotation = await getQuotation(id);
  if (!quotation) return notFound();
  return <QuotationPrintView quotation={quotation} />;
}

import { listQuotations } from "@/lib/queries/quotations";
import { QuotationsListView } from "@/components/quotations/quotations-list-view";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const quotations = await listQuotations();
  return <QuotationsListView quotations={quotations} />;
}

import { useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { QuotationPrintView } from "../components/quotation-print-view";
import { useQuotation } from "../queries";
import { suratAsli, suratRevisi } from "../surat-revisi";

export function QuotationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuotation(id);
  // ?versi=revisi → surat dengan harga hasil revisi, nomor surat tetap sama.
  const [params] = useSearchParams();
  const revisi = params.get("versi") === "revisi";
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  // Versi asli tetap memakai masa berlaku surat asli walau surat revisi sudah dicetak.
  return <QuotationPrintView quotation={revisi ? suratRevisi(q.data) : suratAsli(q.data)} revisi={revisi} />;
}

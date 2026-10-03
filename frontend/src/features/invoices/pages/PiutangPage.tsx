import { useMemo } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import type { InvoiceListRow } from "@/types";
import { PiutangView } from "../components/piutang-view";
import { useInvoices, usePiutangSummary } from "../queries";

/**
 * BATASAN: piutang = tagihan draft / terkirim yang belum lunas (draft ikut
 * dihitung, sama dengan get_piutang_summary — migration 20261003000013).
 * Urut yang paling lama menunggak lebih dulu — itu urutan menelepon, bukan
 * urutan nomor tagihan.
 */
export function tagihanPiutang(rows: InvoiceListRow[]): InvoiceListRow[] {
  return rows
    .filter((r) => (r.status === "draft" || r.status === "terkirim") && r.sisa > 0)
    .sort((a, b) => (a.jatuh_tempo ?? "9999").localeCompare(b.jatuh_tempo ?? "9999"));
}

export function PiutangPage() {
  const summary = usePiutangSummary();
  const invoices = useInvoices();
  const outstanding = useMemo(() => tagihanPiutang(invoices.data ?? []), [invoices.data]);

  if (summary.isPending || invoices.isPending) return <PageLoading />;
  if (summary.isError) return <PageError error={summary.error} onRetry={summary.refetch} />;
  if (invoices.isError) return <PageError error={invoices.error} onRetry={invoices.refetch} />;
  return <PiutangView summary={summary.data} outstanding={outstanding} />;
}

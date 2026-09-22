import { useMemo } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { PiutangView } from "../components/piutang-view";
import { useInvoices, usePiutangSummary } from "../queries";

export function PiutangPage() {
  const summary = usePiutangSummary();
  const terkirim = useInvoices({ status: "terkirim" });

  // Yang paling lama menunggak lebih dulu — itu urutan menelepon, bukan
  // urutan nomor tagihan.
  const outstanding = useMemo(
    () =>
      (terkirim.data ?? [])
        .filter((r) => r.sisa > 0)
        .sort((a, b) => (a.jatuh_tempo ?? "9999").localeCompare(b.jatuh_tempo ?? "9999")),
    [terkirim.data]
  );

  if (summary.isPending || terkirim.isPending) return <PageLoading />;
  if (summary.isError) return <PageError error={summary.error} onRetry={summary.refetch} />;
  if (terkirim.isError) return <PageError error={terkirim.error} onRetry={terkirim.refetch} />;
  return <PiutangView summary={summary.data} outstanding={outstanding} />;
}

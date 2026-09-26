import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { BastPenjualanView, SuratPenjualanView } from "../components/dokumen-penjualan";
import { usePenjualanDetail } from "../queries";

export function SuratPenjualanPage() {
  const { id = null } = useParams<{ id: string }>();
  const p = usePenjualanDetail(id);
  if (p.isPending) return <PageLoading />;
  if (p.isError) return <PageError error={p.error} onRetry={p.refetch} />;
  return <SuratPenjualanView penjualan={p.data} />;
}

export function BastPenjualanPage() {
  const { id = null } = useParams<{ id: string }>();
  const p = usePenjualanDetail(id);
  if (p.isPending) return <PageLoading />;
  if (p.isError) return <PageError error={p.error} onRetry={p.refetch} />;
  return <BastPenjualanView penjualan={p.data} />;
}

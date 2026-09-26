import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { BeritaAcaraPenghapusanView } from "../components/berita-acara-penghapusan";
import { usePenghapusanDetail } from "../queries";

export function BeritaAcaraPenghapusanPage() {
  const { id = null } = useParams<{ id: string }>();
  const p = usePenghapusanDetail(id);
  if (p.isPending) return <PageLoading />;
  if (p.isError) return <PageError error={p.error} onRetry={p.refetch} />;
  return <BeritaAcaraPenghapusanView penghapusan={p.data} />;
}

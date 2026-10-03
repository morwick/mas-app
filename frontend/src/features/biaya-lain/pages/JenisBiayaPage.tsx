import { PageError, PageLoading } from "@/components/ui/page-state";
import { JenisBiayaView } from "../components/jenis-biaya-view";
import { useJenisBiaya } from "../queries";

/** Master Data → Jenis Biaya. */
export function JenisBiayaPage() {
  const jenis = useJenisBiaya();
  if (jenis.isPending) return <PageLoading />;
  if (jenis.isError) return <PageError error={jenis.error} onRetry={jenis.refetch} />;
  return <JenisBiayaView list={jenis.data} />;
}

import { useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { usePerintahKerja, type JenisAset } from "../api";
import { PerintahKerjaDetail } from "../components/perintah-kerja-detail";
import { PerintahKerjaForm } from "../components/perintah-kerja-form";

/** `/perintah-kerja/new?unit=…` / `?trailer=…` / `&insiden=…` mengisi form dari halaman asal. */
export function NewPerintahKerjaPage() {
  const [sp] = useSearchParams();
  const trailer = sp.get("trailer");
  const jenisAset: JenisAset = trailer ? "unit_trailer" : "unit";
  return (
    <PerintahKerjaForm
      mode="new"
      awal={{ jenisAset, asetId: trailer ?? sp.get("unit") ?? undefined, incidentId: sp.get("insiden") ?? undefined }}
    />
  );
}

export function EditPerintahKerjaPage() {
  const { id } = useParams<{ id: string }>();
  const q = usePerintahKerja(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <PerintahKerjaForm mode="edit" initial={q.data} />;
}

export function PerintahKerjaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = usePerintahKerja(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <PerintahKerjaDetail wo={q.data} />;
}

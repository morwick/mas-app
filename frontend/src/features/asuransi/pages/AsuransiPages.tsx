import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { BengkelView } from "@/features/bengkel/bengkel-view";
import { MekanikView } from "@/features/mekanik/mekanik-view";
import { AsuransiDetailView } from "../components/asuransi-detail-view";
import { AsuransiForm } from "../components/asuransi-form";
import { AsuransiListView } from "../components/asuransi-list-view";
import { useAsuransi } from "../queries";

export function AsuransiPage() {
  return <AsuransiListView />;
}

export function NewAsuransiPage() {
  return <AsuransiForm mode="new" />;
}

export function EditAsuransiPage() {
  const { id } = useParams<{ id: string }>();
  const q = useAsuransi(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <AsuransiForm mode="edit" initial={q.data} />;
}

export function AsuransiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useAsuransi(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <AsuransiDetailView asuransi={q.data} />;
}

export function BengkelPage() {
  return <BengkelView />;
}

export function MekanikPage() {
  return <MekanikView />;
}

import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { UnitTrailerDetailView } from "../components/unit-trailer-detail-view";
import {
  useUnitTrailerDetail,
  useUnitTrailerHistory,
  useUnitTrailerIncidents,
  useUnitTrailerJobs
} from "../queries";

export function UnitTrailerDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const trailer = useUnitTrailerDetail(id);
  const jobs = useUnitTrailerJobs(id);
  const history = useUnitTrailerHistory(id);
  const incidents = useUnitTrailerIncidents(id);

  if (trailer.isPending) return <PageLoading />;
  if (trailer.isError) return <PageError error={trailer.error} onRetry={trailer.refetch} />;
  return (
    <UnitTrailerDetailView
      trailer={trailer.data}
      jobs={jobs.data ?? []}
      history={history.data ?? []}
      incidents={incidents.data ?? []}
    />
  );
}

import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { UnitDetailView } from "../components/unit-detail-view";
import {
  useUnit,
  useUnitIncidents,
  useUnitJobs,
  useUnitServices,
  useUnitStatusHistory
} from "../queries";

export function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const unit = useUnit(id);
  const jobs = useUnitJobs(id);
  const history = useUnitStatusHistory(id);
  const incidents = useUnitIncidents(id);
  const services = useUnitServices(id);

  if (unit.isPending) return <PageLoading />;
  if (unit.isError) return <PageError error={unit.error} onRetry={unit.refetch} />;
  return (
    <UnitDetailView
      unit={unit.data}
      jobs={jobs.data ?? []}
      history={history.data ?? []}
      incidents={incidents.data ?? []}
      services={services.data ?? []}
    />
  );
}

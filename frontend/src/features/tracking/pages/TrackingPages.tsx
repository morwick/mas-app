import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDriver } from "@/features/drivers/queries";
import { useJob, useJobs } from "@/features/jobs/queries";
import { useUnit, useUnits } from "@/features/units/queries";
import { AdminTrackingDetailView } from "../components/admin-tracking-detail-view";
import { AdminTrackingListView } from "../components/admin-tracking-list-view";
import { FleetMapView } from "../components/fleet-map-view";

export function TrackingListPage() {
  const jobs = useJobs({ status: "active" });
  const units = useUnits();
  if (jobs.isPending || units.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return <AdminTrackingListView jobs={jobs.data} units={units.data} />;
}

export function TrackingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const job = useJob(id);
  const unit = useUnit(job.data?.unit_id);
  const driver = useDriver(job.data?.driver_id);
  if (job.isPending) return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  return (
    <AdminTrackingDetailView job={job.data} unit={unit.data ?? null} driver={driver.data ?? null} />
  );
}

export function FleetMapPage() {
  const units = useUnits();
  const jobs = useJobs({ status: "active" });
  if (units.isPending || jobs.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  return <FleetMapView units={units.data} activeJobs={jobs.data} />;
}

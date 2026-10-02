import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useMemo } from "react";
import { useDriver, useDrivers } from "@/features/drivers/queries";
import { useJob, useJobs } from "@/features/jobs/queries";
import { useUnit, useUnits } from "@/features/units/queries";
import { AdminTrackingDetailView } from "../components/admin-tracking-detail-view";
import { AdminTrackingListView } from "../components/admin-tracking-list-view";
import { FleetMapView } from "../components/fleet-map-view";
import { useSesiTrackSolid } from "@/features/tracksolid/use-sesi-tracksolid";

export function TrackingListPage() {
  // Halaman ber-data TrackSolid: cek sesi saat dibuka, popup captcha bila perlu.
  useSesiTrackSolid();
  const jobs = useJobs({ status: "active" });
  const units = useUnits();
  // Nama driver per job (driver nonaktif ikut, supaya job lama tetap bernama).
  const drivers = useDrivers(true);
  const driverMap = useMemo(
    () => Object.fromEntries((drivers.data ?? []).map((d) => [d.id, d.nama])),
    [drivers.data]
  );
  if (jobs.isPending || units.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return <AdminTrackingListView jobs={jobs.data} units={units.data} driverMap={driverMap} />;
}

export function TrackingDetailPage() {
  // Halaman ber-data TrackSolid: cek sesi saat dibuka, popup captcha bila perlu.
  useSesiTrackSolid();
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
  // Halaman ber-data TrackSolid: cek sesi saat dibuka, popup captcha bila perlu.
  useSesiTrackSolid();
  const units = useUnits();
  const jobs = useJobs({ status: "active" });
  const drivers = useDrivers(true);
  const driverMap = useMemo(
    () => Object.fromEntries((drivers.data ?? []).map((d) => [d.id, d.nama])),
    [drivers.data]
  );
  if (units.isPending || jobs.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  return <FleetMapView units={units.data} activeJobs={jobs.data} driverMap={driverMap} />;
}

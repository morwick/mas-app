import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries/jobs";
import { getUnit } from "@/lib/queries/units";
import { getDriver } from "@/lib/queries/drivers";
import { AdminTrackingDetailView } from "@/components/tracking/admin-tracking-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminTrackingDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return notFound();
  const [unit, driver] = await Promise.all([
    getUnit(job.unit_id),
    getDriver(job.driver_id)
  ]);
  return <AdminTrackingDetailView job={job} unit={unit} driver={driver} />;
}

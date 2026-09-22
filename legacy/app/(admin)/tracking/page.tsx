import { listJobs } from "@/lib/queries/jobs";
import { listUnits } from "@/lib/queries/units";
import { AdminTrackingListView } from "@/components/tracking/admin-tracking-list-view";

export const dynamic = "force-dynamic";

export default async function AdminTrackingListPage() {
  const [jobs, units] = await Promise.all([
    listJobs({ status: "active" }),
    listUnits()
  ]);
  return <AdminTrackingListView jobs={jobs} units={units} />;
}

import { listJobs } from "@/lib/queries/jobs";
import { listUnits } from "@/lib/queries/units";
import { AdminTrackingListView } from "@/components/tracking/admin-tracking-list-view";
import type { Unit } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminTrackingListPage() {
  const [jobs, units] = await Promise.all([
    listJobs({ status: "active" }),
    listUnits()
  ]);
  const unitsMap = new Map<string, Unit>();
  for (const u of units) unitsMap.set(u.id, u);
  return <AdminTrackingListView jobs={jobs} unitsMap={unitsMap} />;
}

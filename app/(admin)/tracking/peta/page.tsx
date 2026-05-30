import { listUnits } from "@/lib/queries/units";
import { listJobs } from "@/lib/queries/jobs";
import { FleetMapView } from "@/components/tracking/fleet-map-view";

export const dynamic = "force-dynamic";

export default async function FleetMapPage() {
  const [units, activeJobs] = await Promise.all([
    listUnits(),
    listJobs({ status: "active" })
  ]);
  return <FleetMapView units={units} activeJobs={activeJobs} />;
}

import { listUnits } from "@/lib/queries/units";
import { FleetMapView } from "@/components/tracking/fleet-map-view";

export const dynamic = "force-dynamic";

export default async function FleetMapPage() {
  const units = await listUnits();
  return <FleetMapView units={units} />;
}

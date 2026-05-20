import { listDrivers } from "@/lib/queries/drivers";
import { DriversListView } from "@/components/drivers/drivers-list-view";

export const dynamic = "force-dynamic";

export default async function DriversListPage() {
  const drivers = await listDrivers({ includeInactive: true });
  return <DriversListView drivers={drivers} />;
}

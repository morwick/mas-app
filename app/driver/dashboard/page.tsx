import { redirect } from "next/navigation";
import { getMyJobs } from "@/lib/queries/driver-portal";
import { getDriverSession } from "@/lib/driver-session";
import { DriverDashboardView } from "@/components/driver/driver-dashboard-view";

export const dynamic = "force-dynamic";

export default async function DriverDashboardPage() {
  const session = await getDriverSession();
  if (!session) redirect("/driver/login");

  const jobs = await getMyJobs({ status: "all" });

  return <DriverDashboardView driverNama={session.nama} jobs={jobs} />;
}

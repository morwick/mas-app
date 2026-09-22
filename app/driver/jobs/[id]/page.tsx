import { redirect, notFound } from "next/navigation";
import { getMyJob } from "@/lib/queries/driver-portal";
import { getDriverSession } from "@/lib/driver-session";
import { DriverJobDetailView } from "@/components/driver/driver-job-detail-view";

export const dynamic = "force-dynamic";

export default async function DriverJobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getDriverSession();
  if (!session) redirect("/driver/login");

  // RLS hanya melepas job milik driver ini. Job orang lain sampai di sini
  // sebagai null, sama seperti job yang memang tidak ada.
  const job = await getMyJob(id);
  if (!job) notFound();

  return <DriverJobDetailView job={job} />;
}

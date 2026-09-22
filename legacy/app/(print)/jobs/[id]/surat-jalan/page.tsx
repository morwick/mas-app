import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries/jobs";
import { getUnit } from "@/lib/queries/units";
import { getDriver } from "@/lib/queries/drivers";
import { getCurrentUser } from "@/lib/queries/profile";
import { SuratJalanView } from "@/components/jobs/surat-jalan-view";

export const dynamic = "force-dynamic";

export default async function SuratJalanPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, currentUser] = await Promise.all([getJob(id), getCurrentUser()]);
  if (!job) return notFound();
  const [unit, driver] = await Promise.all([
    getUnit(job.unit_id),
    getDriver(job.driver_id)
  ]);
  return (
    <SuratJalanView
      job={job}
      unit={unit}
      driver={driver}
      currentUserNama={currentUser?.nama ?? "Admin"}
    />
  );
}

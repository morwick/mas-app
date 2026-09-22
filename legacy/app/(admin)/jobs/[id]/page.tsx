import { notFound } from "next/navigation";
import { getJob, getJobStatusHistory } from "@/lib/queries/jobs";
import { getDriver } from "@/lib/queries/drivers";
import { getUnit } from "@/lib/queries/units";
import {
  listSumberDana,
  listUangJalanByJob,
  hitungRingkasan
} from "@/lib/queries/uang-jalan";
import { JobDetailView } from "@/components/jobs/job-detail-view";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return notFound();
  const [unit, driver, history, sumberDana, uangJalan] = await Promise.all([
    getUnit(job.unit_id),
    getDriver(job.driver_id),
    getJobStatusHistory(job.id),
    listSumberDana(),
    listUangJalanByJob(job.id)
  ]);
  return (
    <JobDetailView
      job={job}
      unit={unit}
      driver={driver}
      history={history}
      sumberDana={sumberDana}
      uangJalan={uangJalan}
      uangJalanRingkasan={hitungRingkasan(job.uang_jalan_pagu ?? 0, uangJalan)}
    />
  );
}

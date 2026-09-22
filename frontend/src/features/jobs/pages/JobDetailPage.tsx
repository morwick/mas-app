import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDriver } from "@/features/drivers/queries";
import { useUnit } from "@/features/units/queries";
import { useJobUangJalan, useSumberDana } from "@/features/uang-jalan/queries";
import { JobDetailView } from "../components/job-detail-view";
import { useJob, useJobHistory } from "../queries";

const EMPTY_RINGKASAN = {
  pagu_awal: 0,
  penambahan: 0,
  pagu: 0,
  cair: 0,
  sisa: 0,
  persen_cair: 0
};

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const job = useJob(id);
  const unit = useUnit(job.data?.unit_id);
  const driver = useDriver(job.data?.driver_id);
  const history = useJobHistory(id);
  const sumberDana = useSumberDana();
  const uangJalan = useJobUangJalan(id);

  if (job.isPending) return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  return (
    <JobDetailView
      job={job.data}
      unit={unit.data ?? null}
      driver={driver.data ?? null}
      history={history.data ?? []}
      sumberDana={sumberDana.data ?? []}
      uangJalan={uangJalan.data?.transaksi ?? []}
      uangJalanRingkasan={uangJalan.data?.ringkasan ?? EMPTY_RINGKASAN}
    />
  );
}

import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useDriver } from "@/features/drivers/queries";
import { useUnit } from "@/features/units/queries";
import { SuratJalanView } from "../components/surat-jalan-view";
import { useJob } from "../queries";

export function SuratJalanPage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const job = useJob(id);
  const unit = useUnit(job.data?.unit_id);
  const driver = useDriver(job.data?.driver_id);

  if (job.isPending || (job.data && (unit.isPending || driver.isPending))) return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  return (
    <SuratJalanView
      job={job.data}
      unit={unit.data ?? null}
      driver={driver.data ?? null}
      currentUserNama={user.nama}
    />
  );
}

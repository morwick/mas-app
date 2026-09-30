import { useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useJenisUnit } from "@/features/settings/queries";
import { UnitsListView } from "../components/units-list-view";
import { useUnits } from "../queries";
import { useSesiTrackSolid } from "@/features/tracksolid/use-sesi-tracksolid";

export function UnitsPage() {
  // Halaman ber-data TrackSolid: cek sesi saat dibuka, popup captcha bila perlu.
  useSesiTrackSolid();
  const units = useUnits(true, true);
  const jenis = useJenisUnit();
  const [searchParams] = useSearchParams();
  if (units.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return (
    <UnitsListView
      units={units.data}
      jenisUnitList={jenis.data ?? []}
      initialStatus={searchParams.get("status") ?? undefined}
    />
  );
}

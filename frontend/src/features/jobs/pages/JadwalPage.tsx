import { useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useUnits } from "@/features/units/queries";
import { bukanArmada } from "@/lib/unit-status";
import { JadwalView } from "../components/jadwal-view";
import { useJobsInRange } from "../queries";

/** Senin pada minggu yang memuat tanggal tertentu. */
function seninDari(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay(): Minggu = 0. Digeser supaya Senin jadi awal minggu, mengikuti
  // cara orang kantor membaca jadwal.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function tambahHari(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function JadwalPage() {
  const [params] = useSearchParams();
  const weekStart = seninDari(params.get("start") || new Date().toISOString().slice(0, 10));
  const weekEnd = tambahHari(weekStart, 6);

  const units = useUnits();
  const jobs = useJobsInRange(weekStart, weekEnd);

  if (units.isPending || jobs.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Jadwal armada</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Satu baris per unit. Job yang bertumpuk di baris yang sama berarti unit itu
          dijadwalkan dua kali.
        </p>
      </div>
      <JadwalView
        units={units.data.filter((u) => !bukanArmada(u.status))}
        jobs={jobs.data}
        weekStart={weekStart}
      />
    </div>
  );
}

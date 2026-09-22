import { listUnits } from "@/lib/queries/units";
import { listJobsInRange } from "@/lib/queries/jobs";
import { JadwalView } from "@/components/jobs/jadwal-view";

export const dynamic = "force-dynamic";

/** Senin pada minggu yang memuat tanggal tertentu. */
function seninDari(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay(): Minggu = 0. Digeser supaya Senin jadi awal minggu, mengikuti
  // cara orang kantor membaca jadwal.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export default async function JadwalPage({
  searchParams
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const sp = await searchParams;
  const weekStart = seninDari(sp.start || new Date().toISOString().slice(0, 10));
  const weekEnd = (() => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const [units, jobs] = await Promise.all([
    listUnits(),
    listJobsInRange(weekStart, weekEnd)
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Jadwal armada</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Satu baris per unit. Job yang bertumpuk di baris yang sama berarti
          unit itu dijadwalkan dua kali.
        </p>
      </div>
      <JadwalView units={units} jobs={jobs} weekStart={weekStart} />
    </div>
  );
}

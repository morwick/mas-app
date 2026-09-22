import { getJobProfitability } from "@/lib/queries/invoices";
import { LabaView } from "@/components/reports/laba-view";

export const dynamic = "force-dynamic";

/** Default: bulan berjalan. Rentang lain diatur lewat form di halaman. */
function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10)
  };
}

export default async function LabaReportPage({
  searchParams
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const def = defaultRange();
  const start = sp.start || def.start;
  const end = sp.end || def.end;

  const rows = await getJobProfitability({ start, end });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Laba per job</h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Pendapatan dari tagihan dikurangi uang jalan dan biaya insiden.
        </p>
      </div>
      <LabaView rows={rows} start={start} end={end} />
    </div>
  );
}

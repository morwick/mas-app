import { getUtilizationReport } from "@/lib/queries/reports";
import { UtilizationView } from "@/components/reports/utilization-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    period?: "month_now" | "month_prev" | "custom";
    from?: string;
    to?: string;
  }>;
}

function computeRange(
  period: "month_now" | "month_prev" | "custom",
  from?: string,
  to?: string
): { start: Date; end: Date } {
  const now = new Date();
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(to) };
  }
  if (period === "month_prev") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;
  return { start, end };
}

export default async function UtilisasiReportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const period = sp.period ?? "month_now";
  const { start, end } = computeRange(period, sp.from, sp.to);
  const rows = await getUtilizationReport(start.toISOString(), end.toISOString());
  return (
    <UtilizationView
      rows={rows}
      period={period}
      from={sp.from}
      to={sp.to}
      rangeStart={start.toISOString()}
      rangeEnd={end.toISOString()}
    />
  );
}

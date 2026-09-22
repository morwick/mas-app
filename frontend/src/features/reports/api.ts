import { api } from "@/lib/api/client";
import type { UtilizationRow } from "@/types";

export const utilizationReport = (startISO: string, endISO: string) =>
  api.get<UtilizationRow[]>("/reports/utilization", { start: startISO, end: endISO });

import { api } from "@/lib/api/client";
import type { LabaTahunan, UtilizationRow } from "@/types";

export const utilizationReport = (startISO: string, endISO: string) =>
  api.get<UtilizationRow[]>("/reports/utilization", { start: startISO, end: endISO });

export const labaTahunan = (tahun: number) =>
  api.get<LabaTahunan>("/reports/laba-tahunan", { tahun });

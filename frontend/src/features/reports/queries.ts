import { useQuery } from "@tanstack/react-query";
import { labaTahunan, utilizationReport } from "./api";

export const useUtilizationReport = (startISO: string, endISO: string) =>
  useQuery({
    queryKey: ["reports", "utilization", startISO, endISO],
    queryFn: () => utilizationReport(startISO, endISO)
  });

export const useLabaTahunan = (tahun: number) =>
  useQuery({
    queryKey: ["reports", "laba-tahunan", tahun],
    queryFn: () => labaTahunan(tahun)
  });

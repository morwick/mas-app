import { useQuery } from "@tanstack/react-query";
import { utilizationReport } from "./api";

export const useUtilizationReport = (startISO: string, endISO: string) =>
  useQuery({
    queryKey: ["reports", "utilization", startISO, endISO],
    queryFn: () => utilizationReport(startISO, endISO)
  });

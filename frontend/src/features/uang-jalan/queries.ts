import { useQuery } from "@tanstack/react-query";
import { jobUangJalan, listJobUangJalan, listPendingRequests, listSumberDana } from "./api";

export const useSumberDana = () => useQuery({ queryKey: ["sumber-dana"], queryFn: listSumberDana });
export const useJobUangJalanRows = () =>
  useQuery({ queryKey: ["uang-jalan", "jobs"], queryFn: listJobUangJalan });
export const useJobUangJalan = (jobId: string | undefined) =>
  useQuery({ queryKey: ["uang-jalan", "job", jobId], queryFn: () => jobUangJalan(jobId!), enabled: !!jobId });
export const usePendingRequests = () =>
  useQuery({
    queryKey: ["uang-jalan", "pengajuan"],
    queryFn: listPendingRequests,
    refetchInterval: 60_000
  });

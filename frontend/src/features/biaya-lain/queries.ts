import { useQuery } from "@tanstack/react-query";
import { kunciBiayaLainJob, listBiayaLainJob, listJenisBiaya } from "./api";

export const useJenisBiaya = () => useQuery({ queryKey: ["jenis-biaya"], queryFn: listJenisBiaya });

export const useBiayaLainJob = (jobId: string | undefined) =>
  useQuery({
    queryKey: kunciBiayaLainJob(jobId ?? ""),
    queryFn: () => listBiayaLainJob(jobId!),
    enabled: !!jobId
  });

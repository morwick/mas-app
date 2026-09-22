import { useQuery } from "@tanstack/react-query";
import { myJob, myJobs } from "./api";

export const useMyJobs = (status: "active" | "all" = "all") =>
  useQuery({
    queryKey: ["driver", "jobs", status],
    queryFn: () => myJobs(status),
    refetchInterval: 60_000
  });

export const useMyJob = (id: string | undefined) =>
  useQuery({ queryKey: ["driver", "job", id], queryFn: () => myJob(id!), enabled: !!id });

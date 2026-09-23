import { useQuery } from "@tanstack/react-query";
import { driverNotifications, driverUangJalan, myJob, myJobs } from "./api";

export const useMyJobs = (status: "active" | "all" = "all") =>
  useQuery({
    queryKey: ["driver", "jobs", status],
    queryFn: () => myJobs(status),
    refetchInterval: 60_000
  });

export const useMyJob = (id: string | undefined) =>
  useQuery({
    queryKey: ["driver", "job", id],
    queryFn: () => myJob(id!),
    enabled: !!id,
    refetchInterval: 30_000
  });

export const useDriverUangJalan = (jobId: string | undefined) =>
  useQuery({
    queryKey: ["driver", "uang-jalan", jobId],
    queryFn: () => driverUangJalan(jobId!),
    enabled: !!jobId,
    refetchInterval: 30_000
  });

export const useDriverNotifications = () =>
  useQuery({ queryKey: ["driver", "notifications"], queryFn: driverNotifications, refetchInterval: 60_000 });

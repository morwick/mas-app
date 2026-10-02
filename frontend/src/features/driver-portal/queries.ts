import { useQuery } from "@tanstack/react-query";
import { NOTIFIKASI_POLL_MS } from "@/features/notifications/queries";
import { driverNotifications, driverUangJalan, myJob, myJobs, type DriverJobFilter } from "./api";

export const useMyJobs = (status: DriverJobFilter = "all") =>
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
  useQuery({
    queryKey: ["driver", "notifications"],
    queryFn: driverNotifications,
    // Notifikasi diperbarui di latar — tidak memunculkan popup loading halaman.
    meta: { latar: true },
    refetchInterval: NOTIFIKASI_POLL_MS,
    refetchIntervalInBackground: true
  });

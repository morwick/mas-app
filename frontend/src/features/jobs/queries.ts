import { useQuery } from "@tanstack/react-query";
import { activeJobsByUnit, getJob, getJobHistory, getRiwayatGantiTruk, jobsInRange, listJobs, type JobListFilter } from "./api";

export const jobKeys = {
  list: (status: JobListFilter, customerId?: string) =>
    ["jobs", "list", status, customerId ?? ""] as const,
  detail: (id: string) => ["jobs", "detail", id] as const,
  history: (id: string) => ["jobs", "history", id] as const,
  activeByUnit: ["jobs", "active-by-unit"] as const,
  range: (start: string, end: string) => ["jobs", "range", start, end] as const
};

export const useJobs = (opts?: { status?: JobListFilter; customerId?: string }) =>
  useQuery({
    queryKey: jobKeys.list(opts?.status ?? "all", opts?.customerId),
    queryFn: () => listJobs(opts)
  });

export const useJob = (id: string | undefined) =>
  useQuery({ queryKey: jobKeys.detail(id ?? ""), queryFn: () => getJob(id!), enabled: !!id });

export const useJobHistory = (id: string | undefined) =>
  useQuery({ queryKey: jobKeys.history(id ?? ""), queryFn: () => getJobHistory(id!), enabled: !!id });

export const useActiveJobsByUnit = () =>
  useQuery({ queryKey: jobKeys.activeByUnit, queryFn: activeJobsByUnit });

export const useJobsInRange = (start: string, end: string) =>
  useQuery({ queryKey: jobKeys.range(start, end), queryFn: () => jobsInRange(start, end) });

export const useRiwayatGantiTruk = (id: string | undefined) =>
  useQuery({ queryKey: ["jobs", "ganti-truk", id ?? ""], queryFn: () => getRiwayatGantiTruk(id!), enabled: !!id });

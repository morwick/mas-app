import { useQuery } from "@tanstack/react-query";
import { getDriver, getDriverJobs, getDriverKasbon, listDrivers, listKaryawanDriver } from "./api";

export const driverKeys = {
  list: (includeInactive: boolean) => ["drivers", "list", includeInactive] as const,
  detail: (id: string) => ["drivers", "detail", id] as const,
  jobs: (id: string) => ["drivers", "jobs", id] as const
};

export const useDrivers = (includeInactive = false, onlyStandBy = false) =>
  useQuery({
    queryKey: [...driverKeys.list(includeInactive), onlyStandBy],
    queryFn: () => listDrivers(includeInactive, onlyStandBy)
  });

export const useDriver = (id: string | undefined) =>
  useQuery({ queryKey: driverKeys.detail(id ?? ""), queryFn: () => getDriver(id!), enabled: !!id });

export const useKaryawanDriver = () =>
  useQuery({ queryKey: ["drivers", "karyawan-pilihan"], queryFn: listKaryawanDriver });

export const useDriverJobs = (id: string | undefined) =>
  useQuery({ queryKey: driverKeys.jobs(id ?? ""), queryFn: () => getDriverJobs(id!), enabled: !!id });

export const useDriverKasbon = (id: string | undefined) =>
  useQuery({ queryKey: ["drivers", "kasbon", id ?? ""], queryFn: () => getDriverKasbon(id!), enabled: !!id });

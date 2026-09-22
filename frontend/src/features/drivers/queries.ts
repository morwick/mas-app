import { useQuery } from "@tanstack/react-query";
import { getDriver, listDrivers } from "./api";

export const driverKeys = {
  list: (includeInactive: boolean) => ["drivers", "list", includeInactive] as const,
  detail: (id: string) => ["drivers", "detail", id] as const
};

export const useDrivers = (includeInactive = false) =>
  useQuery({ queryKey: driverKeys.list(includeInactive), queryFn: () => listDrivers(includeInactive) });

export const useDriver = (id: string | undefined) =>
  useQuery({ queryKey: driverKeys.detail(id ?? ""), queryFn: () => getDriver(id!), enabled: !!id });

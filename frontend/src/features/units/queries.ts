import { useQuery } from "@tanstack/react-query";
import {
  getDriverAssignments,
  getUnit,
  getUnitIncidents,
  getUnitJobs,
  getUnitServices,
  getUnitStatusHistory,
  listUnits
} from "./api";

export const unitKeys = {
  list: (includeInactive: boolean) => ["units", "list", includeInactive] as const,
  detail: (id: string) => ["units", "detail", id] as const,
  history: (id: string) => ["units", "history", id] as const,
  jobs: (id: string) => ["units", "jobs", id] as const,
  incidents: (id: string) => ["units", "incidents", id] as const,
  services: (id: string) => ["units", "services", id] as const,
  driverAssignments: ["units", "driver-assignments"] as const
};

export const useUnits = (includeInactive = false) =>
  useQuery({
    queryKey: unitKeys.list(includeInactive),
    queryFn: () => listUnits(includeInactive)
  });

export const useUnit = (id: string | undefined) =>
  useQuery({ queryKey: unitKeys.detail(id ?? ""), queryFn: () => getUnit(id!), enabled: !!id });

export const useUnitStatusHistory = (id: string | undefined) =>
  useQuery({
    queryKey: unitKeys.history(id ?? ""),
    queryFn: () => getUnitStatusHistory(id!),
    enabled: !!id
  });

export const useUnitJobs = (id: string | undefined) =>
  useQuery({ queryKey: unitKeys.jobs(id ?? ""), queryFn: () => getUnitJobs(id!), enabled: !!id });

export const useUnitIncidents = (id: string | undefined) =>
  useQuery({
    queryKey: unitKeys.incidents(id ?? ""),
    queryFn: () => getUnitIncidents(id!),
    enabled: !!id
  });

export const useUnitServices = (id: string | undefined) =>
  useQuery({
    queryKey: unitKeys.services(id ?? ""),
    queryFn: () => getUnitServices(id!),
    enabled: !!id
  });

export const useDriverAssignments = () =>
  useQuery({ queryKey: unitKeys.driverAssignments, queryFn: getDriverAssignments });

import { useQuery } from "@tanstack/react-query";
import { customerJobCounts, getCustomer, listCustomers } from "./api";

export const customerKeys = {
  all: ["customers"] as const,
  list: (includeInactive: boolean) => ["customers", "list", includeInactive] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  jobCounts: ["customers", "job-counts"] as const
};

export const useCustomers = (includeInactive = false) =>
  useQuery({ queryKey: customerKeys.list(includeInactive), queryFn: () => listCustomers(includeInactive) });

export const useCustomer = (id: string | undefined) =>
  useQuery({ queryKey: customerKeys.detail(id ?? ""), queryFn: () => getCustomer(id!), enabled: !!id });

export const useCustomerJobCounts = () =>
  useQuery({ queryKey: customerKeys.jobCounts, queryFn: customerJobCounts });

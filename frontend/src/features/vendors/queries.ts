import { useQuery } from "@tanstack/react-query";
import { getVendor, listVendors } from "./api";

export const vendorKeys = {
  all: ["vendors"] as const,
  list: (includeInactive: boolean) => ["vendors", "list", includeInactive] as const,
  detail: (id: string) => ["vendors", "detail", id] as const
};

export const useVendors = (includeInactive = false) =>
  useQuery({ queryKey: vendorKeys.list(includeInactive), queryFn: () => listVendors(includeInactive) });

export const useVendor = (id: string | undefined) =>
  useQuery({ queryKey: vendorKeys.detail(id ?? ""), queryFn: () => getVendor(id!), enabled: !!id });

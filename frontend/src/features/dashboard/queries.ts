import { useQuery } from "@tanstack/react-query";
import { dashboard, financeDashboard, layoutCounts } from "./api";

export const useLayoutCounts = () =>
  // Angka di menu: diperbarui di latar, tidak memunculkan popup loading.
  useQuery({ queryKey: ["layout", "counts"], queryFn: layoutCounts, staleTime: 30_000, meta: { latar: true } });

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: dashboard, refetchInterval: 60_000 });

export const useFinanceDashboard = () =>
  useQuery({ queryKey: ["dashboard", "finance"], queryFn: financeDashboard, refetchInterval: 60_000 });

import { useQuery } from "@tanstack/react-query";
import { dashboard, layoutCounts } from "./api";

export const useLayoutCounts = () =>
  useQuery({ queryKey: ["layout", "counts"], queryFn: layoutCounts, staleTime: 30_000 });

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: dashboard, refetchInterval: 60_000 });

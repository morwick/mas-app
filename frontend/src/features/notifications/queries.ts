import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "./api";

/** Lonceng disegarkan tiap 2 menit — isinya keadaan sekarang, bukan kejadian. */
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled,
    refetchInterval: 120_000,
    staleTime: 60_000
  });

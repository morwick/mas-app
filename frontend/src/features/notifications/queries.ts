import { useQuery } from "@tanstack/react-query";
import { listNotifications, listNotificationsPage } from "./api";

/** Lonceng disegarkan tiap 2 menit — isinya keadaan sekarang, bukan kejadian. */
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled,
    refetchInterval: 120_000,
    staleTime: 60_000
  });

export const notificationPageKey = (page: number, pageSize: number) =>
  ["notifications", "page", page, pageSize] as const;

/** Halaman Notifikasi — kejadian tersimpan, sudah maupun belum dibaca. */
export const useNotificationPage = (page: number, pageSize: number) =>
  useQuery({
    queryKey: notificationPageKey(page, pageSize),
    queryFn: () => listNotificationsPage(page, pageSize)
  });

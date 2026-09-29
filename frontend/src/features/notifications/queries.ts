import { useQuery } from "@tanstack/react-query";
import { listNotifications, listNotificationsPage } from "./api";

/** Notifikasi diambil dari backend tiap 30 detik. */
export const NOTIFIKASI_POLL_MS = 30_000;

/**
 * Lonceng disegarkan tiap 30 detik supaya notifikasi baru cepat muncul (popup)
 * — tetap berjalan walau tab browser sedang tidak aktif.
 */
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled,
    refetchInterval: NOTIFIKASI_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 20_000
  });

export const notificationPageKey = (page: number, pageSize: number) =>
  ["notifications", "page", page, pageSize] as const;

/** Halaman Notifikasi — kejadian tersimpan, sudah maupun belum dibaca. */
export const useNotificationPage = (page: number, pageSize: number) =>
  useQuery({
    queryKey: notificationPageKey(page, pageSize),
    queryFn: () => listNotificationsPage(page, pageSize),
    refetchInterval: NOTIFIKASI_POLL_MS,
    refetchIntervalInBackground: true
  });

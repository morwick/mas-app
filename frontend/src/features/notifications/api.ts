import { api } from "@/lib/api/client";
import type { AppNotification } from "@/lib/notifications";

export const listNotifications = () => api.get<AppNotification[]>("/notifications");

/** Tandai kejadian sebagai dibaca oleh admin ini (id tanpa awalan `event-`). */
export const markNotificationsRead = (ids: string[]) => api.post("/notifications/read", { ids });

// ── Halaman Notifikasi (kejadian tersimpan, bisa dipaginasi) ────────────────

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  page: number;
  page_size: number;
}

export const listNotificationsPage = (page: number, pageSize: number) =>
  api.get<NotificationPage>("/notifications/page", { page, page_size: pageSize });

/** Tandai semua notifikasi admin sebagai dibaca oleh pengguna ini. */
export const markAllNotificationsRead = () => api.post("/notifications/read-all", {});

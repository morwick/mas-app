import { api } from "@/lib/api/client";
import type { AppNotification } from "@/lib/notifications";

export const listNotifications = () => api.get<AppNotification[]>("/notifications");

/** Tandai kejadian sebagai dibaca oleh admin ini (id tanpa awalan `event-`). */
export const markNotificationsRead = (ids: string[]) => api.post("/notifications/read", { ids });

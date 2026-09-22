import { api } from "@/lib/api/client";
import type { AppNotification } from "@/lib/notifications";

export const listNotifications = () => api.get<AppNotification[]>("/notifications");

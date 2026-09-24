/**
 * Status "sudah dibaca" notifikasi, dipakai bersama lonceng dan halaman
 * Notifikasi supaya keduanya sepakat soal mana yang masih baru.
 *
 * Dua sumber, karena isinya memang dua jenis:
 * - Kejadian tersimpan (`persistent`) punya baris di database, jadi statusnya
 *   per pengguna di server dan ikut berpindah perangkat.
 * - Notifikasi keadaan (servis lewat jadwal, job belum dikonfirmasi) dihitung
 *   ulang tiap permintaan dan tidak punya baris untuk ditandai — statusnya
 *   hanya bisa disimpan di browser ini.
 */

import { useCallback, useState } from "react";
import { queryClient } from "@/lib/api/query";
import type { AppNotification } from "@/lib/notifications";
import { markNotificationsRead } from "./api";

const STORAGE_KEY = "mas:notif:read-ids";
const EVENT_PREFIX = "event-";

export function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Mode privat / penyimpanan penuh — tanda baca lokal boleh hilang.
  }
}

/** Buang awalan `event-` supaya cocok dengan id baris di database. */
export function toEventIds(notifs: AppNotification[]): string[] {
  return notifs
    .filter((n) => n.id.startsWith(EVENT_PREFIX))
    .map((n) => n.id.slice(EVENT_PREFIX.length));
}

export interface NotificationReadState {
  isRead: (n: AppNotification) => boolean;
  /** Tandai dibaca: lokal untuk semuanya, plus di server untuk kejadian. */
  mark: (notifs: AppNotification[]) => void;
}

export function useNotificationReadState(): NotificationReadState {
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());

  const isRead = useCallback(
    (n: AppNotification) =>
      n.persistent ? Boolean(n.read) || readIds.has(n.id) : readIds.has(n.id),
    [readIds]
  );

  const mark = useCallback((notifs: AppNotification[]) => {
    if (notifs.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const n of notifs) next.add(n.id);
      saveReadIds(next);
      return next;
    });
    const eventIds = toEventIds(notifs);
    if (eventIds.length === 0) return;
    void markNotificationsRead(eventIds).then(() =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    );
  }, []);

  return { isRead, mark };
}

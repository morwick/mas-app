/**
 * Penyimpanan sesi di browser.
 *
 * Admin: JWT Supabase (access + refresh) hasil `POST /api/auth/login`.
 * Driver: token sesi portal driver hasil `POST /api/driver/login`.
 *
 * Keduanya di localStorage supaya bertahan saat tab ditutup; portal driver
 * dipakai di HP lapangan yang jarang dibuka ulang, jadi login harus bertahan.
 */

import type { CurrentUser, DriverSession } from "@/types";

const ADMIN_KEY = "mas_admin_session";
const DRIVER_KEY = "mas_driver_session";

export interface AdminSession {
  access_token: string;
  refresh_token: string;
  /** Unix seconds; null kalau Supabase tidak mengirimnya. */
  expires_at: number | null;
  user: CurrentUser;
}

export interface StoredDriverSession extends DriverSession {
  token: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage penuh / mode privat — sesi hanya bertahan di memori */
  }
}

export const adminSession = {
  get: () => read<AdminSession>(ADMIN_KEY),
  set: (s: AdminSession | null) => write(ADMIN_KEY, s),
  clear: () => write(ADMIN_KEY, null)
};

export const driverSession = {
  get: () => read<StoredDriverSession>(DRIVER_KEY),
  set: (s: StoredDriverSession | null) => write(DRIVER_KEY, s),
  clear: () => write(DRIVER_KEY, null)
};

/** True bila token akan habis dalam `marginSec` detik (default 60). */
export function isExpiringSoon(s: AdminSession, marginSec = 60): boolean {
  if (!s.expires_at) return false;
  return s.expires_at * 1000 - Date.now() < marginSec * 1000;
}

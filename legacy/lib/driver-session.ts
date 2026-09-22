import "server-only";
import { cookies } from "next/headers";
import { createDriverClient } from "@/lib/supabase/server";

/**
 * Sesi portal driver.
 *
 * Token disimpan di cookie HttpOnly, bukan di query string. Sebelumnya
 * identitas driver dibawa sebagai `?driver_id=<uuid>` — ikut tersalin setiap
 * kali driver membagikan link atau mengirim screenshot, dan bisa ditukar
 * dengan id driver lain begitu saja.
 */

export const DRIVER_COOKIE = "mas_driver_session";

/** 30 hari, disamakan dengan expires_at baris driver_sessions di database. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface DriverSession {
  driverId: string;
  nama: string;
  noHp: string;
  token: string;
}

export async function setDriverCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(DRIVER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export async function clearDriverCookie(): Promise<void> {
  const store = await cookies();
  store.delete(DRIVER_COOKIE);
}

export async function getDriverToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(DRIVER_COOKIE)?.value ?? null;
}

/**
 * Terjemahkan cookie jadi identitas driver. Yang memutuskan sah atau tidak
 * adalah database (driver_me() → current_driver_id()), bukan kode di sini —
 * jadi sesi yang sudah dicabut admin atau kedaluwarsa langsung tertolak.
 */
export async function getDriverSession(): Promise<DriverSession | null> {
  const token = await getDriverToken();
  if (!token) return null;

  const supabase = createDriverClient(token);
  const { data, error } = await supabase.rpc("driver_me");
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return null;

  return {
    driverId: row.id as string,
    nama: (row.nama as string) ?? "",
    noHp: (row.no_hp as string) ?? "",
    token
  };
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "owner" | "operator";

export interface CurrentUser {
  id: string;
  email: string;
  nama: string;
  initials: string;
  role: UserRole;
  /**
   * Subset jenis_unit IDs yang boleh diakses oleh operator.
   * - owner: always null (akses semua)
   * - operator: null/empty → tidak punya scope (akses kosong, owner perlu set dulu)
   *             non-empty → akses hanya unit dengan jenis_unit_id di array
   */
  allowedJenisUnitIds: string[] | null;
}

interface ProfileRow {
  nama: string;
  email: string;
  role: string | null;
  allowed_jenis_unit_ids?: string[] | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Coba load dengan kolom role-scope baru. Kalau migrasi belum di-apply
  // (kolom belum ada), fallback ke schema lama supaya app tetap jalan.
  let profile: ProfileRow | null = null;
  const fresh = await supabase
    .from("profiles")
    .select("nama, email, role, allowed_jenis_unit_ids")
    .eq("id", user.id)
    .maybeSingle();
  if (fresh.error) {
    const legacy = await supabase
      .from("profiles")
      .select("nama, email, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = (legacy.data as ProfileRow | null) ?? null;
  } else {
    profile = (fresh.data as ProfileRow | null) ?? null;
  }

  const nama: string = profile?.nama ?? user.email?.split("@")[0] ?? "Admin";
  const email: string = profile?.email ?? user.email ?? "";
  const initials =
    nama
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]!)
      .join("")
      .toUpperCase() || "A";
  const role: UserRole = profile?.role === "operator" ? "operator" : "owner";
  const allowedJenisUnitIds =
    role === "owner"
      ? null
      : Array.isArray(profile?.allowed_jenis_unit_ids)
        ? profile.allowed_jenis_unit_ids
        : null;
  return {
    id: user.id,
    email,
    nama,
    initials,
    role,
    allowedJenisUnitIds
  };
}

export function isOwner(user: CurrentUser | null): boolean {
  return user?.role === "owner";
}

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

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("nama, email, role, allowed_jenis_unit_ids")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as {
    nama: string;
    email: string;
    role: string | null;
    allowed_jenis_unit_ids: string[] | null;
  } | null;
  const nama: string = p?.nama ?? user.email?.split("@")[0] ?? "Admin";
  const email: string = p?.email ?? user.email ?? "";
  const initials =
    nama
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]!)
      .join("")
      .toUpperCase() || "A";
  const role: UserRole = p?.role === "operator" ? "operator" : "owner";
  const allowedJenisUnitIds =
    role === "owner"
      ? null
      : Array.isArray(p?.allowed_jenis_unit_ids)
        ? p.allowed_jenis_unit_ids
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

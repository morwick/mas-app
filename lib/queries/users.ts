import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UserRow {
  id: string;
  email: string;
  nama: string;
  role: "owner" | "operator";
  is_active: boolean;
  allowed_jenis_unit_ids: string[] | null;
  created_at: string;
}

/**
 * List semua user di sistem. Hanya akan return data kalau caller adalah
 * owner — RLS policy `owners_read_all_profiles`.
 */
export async function listAllUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, nama, role, is_active, allowed_jenis_unit_ids, created_at")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    email: string;
    nama: string;
    role: string | null;
    is_active: boolean;
    allowed_jenis_unit_ids: string[] | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    email: r.email,
    nama: r.nama,
    role: r.role === "operator" ? "operator" : "owner",
    is_active: r.is_active,
    allowed_jenis_unit_ids: r.allowed_jenis_unit_ids,
    created_at: r.created_at
  }));
}

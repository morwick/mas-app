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
interface ProfileRowRaw {
  id: string;
  email: string;
  nama: string;
  role: string | null;
  is_active: boolean;
  allowed_jenis_unit_ids?: string[] | null;
  created_at: string;
}

export async function listAllUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  // Fallback: kalau migrasi role-scope belum di-apply, query tanpa
  // kolom allowed_jenis_unit_ids supaya halaman tetap render.
  let rows: ProfileRowRaw[] | null = null;

  const fresh = await supabase
    .from("profiles")
    .select(
      "id, email, nama, role, is_active, allowed_jenis_unit_ids, created_at"
    )
    .order("created_at", { ascending: true });
  if (fresh.error) {
    const legacy = await supabase
      .from("profiles")
      .select("id, email, nama, role, is_active, created_at")
      .order("created_at", { ascending: true });
    if (legacy.error || !legacy.data) return [];
    rows = legacy.data as unknown as ProfileRowRaw[];
  } else if (fresh.data) {
    rows = fresh.data as unknown as ProfileRowRaw[];
  }

  if (!rows) return [];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    nama: r.nama,
    role: r.role === "operator" ? "operator" : "owner",
    is_active: r.is_active,
    allowed_jenis_unit_ids: r.allowed_jenis_unit_ids ?? null,
    created_at: r.created_at
  }));
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

interface UpdateRoleInput {
  user_id: string;
  role: "owner" | "operator";
  /** Hanya dipakai kalau role = 'operator'. Untuk owner, kolom di-set null. */
  allowed_jenis_unit_ids: string[];
}

/**
 * Update role & scope user lain. Hanya owner yang bisa panggil ini —
 * RLS policy "owners_update_others_profile" akan reject kalau caller bukan
 * owner, atau kalau target = self (mencegah owner tanpa sengaja nonaktifkan
 * diri sendiri).
 */
export async function updateUserRoleAction(
  input: UpdateRoleInput
): Promise<ActionResult<{ ok: true }>> {
  if (!input.user_id) return { ok: false, error: "User tidak valid" };
  if (input.role !== "owner" && input.role !== "operator") {
    return { ok: false, error: "Role tidak valid" };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.id === input.user_id) {
    return {
      ok: false,
      error: "Anda tidak bisa mengubah role akun sendiri"
    };
  }

  const payload =
    input.role === "owner"
      ? { role: "owner", allowed_jenis_unit_ids: null }
      : {
          role: "operator",
          allowed_jenis_unit_ids: Array.from(
            new Set(input.allowed_jenis_unit_ids ?? [])
          )
        };

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", input.user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/users");
  revalidatePath("/", "layout");
  return { ok: true, data: { ok: true } };
}

interface SetActiveInput {
  user_id: string;
  is_active: boolean;
}

export async function setUserActiveAction(
  input: SetActiveInput
): Promise<ActionResult<{ ok: true }>> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.id === input.user_id) {
    return {
      ok: false,
      error: "Anda tidak bisa menonaktifkan akun sendiri"
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: input.is_active })
    .eq("id", input.user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/users");
  return { ok: true, data: { ok: true } };
}

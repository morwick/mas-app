"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

export async function createJenisUnitAction(
  nama: string
): Promise<ActionResult<{ id: string; nama: string }>> {
  if (!nama?.trim()) return { ok: false, error: "Nama wajib diisi" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jenis_unit")
    .insert({ nama: nama.trim() })
    .select("id, nama")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Nama jenis sudah ada" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/settings/jenis-unit");
  revalidatePath("/units/new");
  return { ok: true, data };
}

export async function updateJenisUnitAction(
  id: string,
  nama: string
): Promise<ActionResult> {
  if (!nama?.trim()) return { ok: false, error: "Nama wajib diisi" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("jenis_unit")
    .update({ nama: nama.trim() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/jenis-unit");
  return { ok: true, data: undefined };
}

export async function deleteJenisUnitAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("jenis_unit").delete().eq("id", id);
  if (error) {
    if (error.code === "23503")
      return {
        ok: false,
        error:
          "Jenis ini masih dipakai oleh unit aktif. Hapus / pindahkan unit dulu."
      };
    return { ok: false, error: error.message };
  }
  revalidatePath("/settings/jenis-unit");
  return { ok: true, data: undefined };
}

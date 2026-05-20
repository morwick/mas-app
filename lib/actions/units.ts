"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import type { UnitStatus } from "@/lib/types";

interface UnitInput {
  kode_unit: string;
  jenis_unit_id: string;
  no_polisi: string;
  tahun?: number | null;
  status?: UnitStatus;
  catatan?: string | null;
  default_driver_id?: string | null;
}

export async function createUnitAction(input: UnitInput): Promise<ActionResult<{ id: string }>> {
  if (!input.kode_unit?.trim()) return { ok: false, error: "Kode unit wajib diisi" };
  if (!input.no_polisi?.trim()) return { ok: false, error: "No polisi wajib diisi" };
  if (!input.jenis_unit_id) return { ok: false, error: "Jenis unit wajib dipilih" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .insert({
      kode_unit: input.kode_unit.trim().toUpperCase(),
      jenis_unit_id: input.jenis_unit_id,
      no_polisi: input.no_polisi.trim(),
      tahun: input.tahun ?? null,
      status: input.status ?? "standby",
      catatan: input.catatan?.trim() || null,
      default_driver_id: input.default_driver_id || null
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Kode unit sudah dipakai" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/units");
  revalidatePath("/dashboard");
  revalidatePath("/drivers");
  return { ok: true, data: { id: data.id } };
}

export async function updateUnitAction(
  id: string,
  input: Partial<UnitInput>
): Promise<ActionResult> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.kode_unit) payload.kode_unit = input.kode_unit.trim().toUpperCase();
  if (input.jenis_unit_id) payload.jenis_unit_id = input.jenis_unit_id;
  if (input.no_polisi) payload.no_polisi = input.no_polisi.trim();
  if (input.tahun !== undefined) payload.tahun = input.tahun ?? null;
  if (input.catatan !== undefined) payload.catatan = input.catatan?.trim() || null;
  if (input.default_driver_id !== undefined)
    payload.default_driver_id = input.default_driver_id || null;
  const { error } = await supabase.from("units").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/units");
  revalidatePath(`/units/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/drivers");
  return { ok: true, data: undefined };
}

export async function changeUnitStatusAction(
  id: string,
  status: UnitStatus,
  reason?: string
): Promise<ActionResult> {
  const supabase = await createClient();

  // Update status (logging via DB trigger)
  const { error } = await supabase
    .from("units")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Tambahkan reason secara terpisah (trigger insert tidak punya context reason)
  if (reason?.trim()) {
    await supabase
      .from("unit_status_history")
      .update({ reason: reason.trim() })
      .eq("unit_id", id)
      .order("changed_at", { ascending: false })
      .limit(1);
  }

  revalidatePath("/units");
  revalidatePath(`/units/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function deactivateUnitAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/units");
  revalidatePath("/dashboard");
  redirect("/units");
}

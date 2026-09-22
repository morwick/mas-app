"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

interface DriverInput {
  nama: string;
  no_hp: string;
  no_sim?: string | null;
  sim_berlaku_sampai?: string | null;
  alamat?: string | null;
  catatan?: string | null;
}

function validate(input: DriverInput): string | null {
  if (!input.nama?.trim()) return "Nama wajib diisi";
  if (!input.no_hp?.trim()) return "No HP wajib diisi";
  if (!/^(08|\+628)\d{7,12}$/.test(input.no_hp))
    return "Format No HP: 08xxxxxxxxxx atau +628xxxxxxxxxx";
  return null;
}

export async function createDriverAction(
  input: DriverInput
): Promise<ActionResult<{ id: string }>> {
  const err = validate(input);
  if (err) return { ok: false, error: err };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .insert({
      nama: input.nama.trim(),
      no_hp: input.no_hp.trim(),
      no_sim: input.no_sim?.trim() || null,
      sim_berlaku_sampai: input.sim_berlaku_sampai || null,
      alamat: input.alamat?.trim() || null,
      catatan: input.catatan?.trim() || null
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/drivers");
  return { ok: true, data: { id: data.id } };
}

export async function updateDriverAction(
  id: string,
  input: Partial<DriverInput>
): Promise<ActionResult> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.nama !== undefined) payload.nama = input.nama.trim();
  if (input.no_hp !== undefined) payload.no_hp = input.no_hp.trim();
  if (input.no_sim !== undefined) payload.no_sim = input.no_sim?.trim() || null;
  if (input.sim_berlaku_sampai !== undefined)
    payload.sim_berlaku_sampai = input.sim_berlaku_sampai || null;
  if (input.alamat !== undefined) payload.alamat = input.alamat?.trim() || null;
  if (input.catatan !== undefined) payload.catatan = input.catatan?.trim() || null;
  const { error } = await supabase.from("drivers").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/drivers");
  revalidatePath(`/drivers/${id}/edit`);
  return { ok: true, data: undefined };
}

export async function deactivateDriverAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("drivers")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/drivers");
  redirect("/drivers");
}

/**
 * Set / reset PIN portal driver.
 *
 * Hashing dikerjakan fungsi database `admin_set_driver_pin`, jadi PIN mentah
 * tidak pernah tersimpan di mana pun — termasuk di log PostgREST. Fungsi itu
 * juga mencabut sesi lama driver, supaya reset PIN benar-benar mengeluarkan
 * perangkat yang hilang.
 */
export async function setDriverPinAction(
  id: string,
  pin: string
): Promise<ActionResult> {
  if (!/^\d{6}$/.test(pin)) return { ok: false, error: "PIN harus 6 angka" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_driver_pin", {
    p_driver_id: id,
    p_pin: pin
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/drivers");
  revalidatePath(`/drivers/${id}/edit`);
  return { ok: true, data: undefined };
}

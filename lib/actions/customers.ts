"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

interface CustomerInput {
  nama_perusahaan: string;
  alamat?: string | null;
  catatan?: string | null;
}

export async function createCustomerAction(
  input: CustomerInput
): Promise<ActionResult<{ id: string; nama_perusahaan: string }>> {
  if (!input.nama_perusahaan?.trim())
    return { ok: false, error: "Nama perusahaan wajib diisi" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      nama_perusahaan: input.nama_perusahaan.trim(),
      alamat: input.alamat?.trim() || null,
      catatan: input.catatan?.trim() || null
    })
    .select("id, nama_perusahaan")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/customers");
  revalidatePath("/jobs/new");
  return {
    ok: true,
    data: { id: data.id, nama_perusahaan: data.nama_perusahaan }
  };
}

export async function updateCustomerAction(
  id: string,
  input: Partial<CustomerInput>
): Promise<ActionResult> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.nama_perusahaan !== undefined)
    payload.nama_perusahaan = input.nama_perusahaan.trim();
  if (input.alamat !== undefined) payload.alamat = input.alamat?.trim() || null;
  if (input.catatan !== undefined)
    payload.catatan = input.catatan?.trim() || null;
  const { error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}/edit`);
  return { ok: true, data: undefined };
}

export async function deactivateCustomerAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/customers");
  redirect("/customers");
}

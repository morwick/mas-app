"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

interface CustomerInput {
  nama_perusahaan: string;
  alamat?: string | null;
  catatan?: string | null;
  // Legalitas & PIC — dipakai surat penawaran (baris "Di ___" dan "Up : ___")
  // serta nanti invoice. Sebelumnya diketik ulang tiap order.
  kota?: string | null;
  npwp?: string | null;
  nib?: string | null;
  status_pkp?: boolean;
  termin_hari?: number | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  pic_jabatan?: string | null;
  pic_no_hp?: string | null;
  pic_email?: string | null;
}

/** Field opsional bertipe teks — dinormalkan seragam ("" → null). */
const TEXT_FIELDS = [
  "alamat",
  "catatan",
  "kota",
  "npwp",
  "nib",
  "pic_sapaan",
  "pic_nama",
  "pic_jabatan",
  "pic_no_hp",
  "pic_email"
] as const;

function buildPayload(input: Partial<CustomerInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    if (input[key] !== undefined) {
      const v = input[key];
      payload[key] = typeof v === "string" ? v.trim() || null : (v ?? null);
    }
  }
  if (input.status_pkp !== undefined) payload.status_pkp = input.status_pkp;
  if (input.termin_hari !== undefined)
    payload.termin_hari =
      input.termin_hari === null || Number.isNaN(input.termin_hari)
        ? null
        : input.termin_hari;
  return payload;
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
      ...buildPayload(input)
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
  const payload = buildPayload(input);
  if (input.nama_perusahaan !== undefined)
    payload.nama_perusahaan = input.nama_perusahaan.trim();
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

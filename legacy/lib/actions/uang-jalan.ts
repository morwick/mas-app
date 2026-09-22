"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import type { UangJalanJenis } from "@/lib/types";

interface UangJalanInput {
  job_id: string;
  jenis: UangJalanJenis;
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  keperluan?: string | null;
  catatan?: string | null;
}

/**
 * Validasi yang dipakai bersama oleh create dan update.
 *
 * Aturan sumber dana mengikuti constraint di database: pencairan wajib
 * menyebut kasnya (tanpa itu ekspor Excel tidak tahu masuk kolom mana),
 * penambahan pagu justru tidak boleh punya sumber karena tidak ada uang
 * yang berpindah.
 */
function periksa(input: UangJalanInput): string | null {
  if (!input.job_id) return "Job wajib dipilih";
  if (!input.tanggal) return "Tanggal wajib diisi";
  if (!Number.isFinite(input.jumlah) || input.jumlah <= 0)
    return "Jumlah harus lebih dari nol";
  if (input.jenis === "pencairan" && !input.sumber_dana_id)
    return "Uang yang dikasih harus menyebut dari kas mana";
  if (input.jenis === "penambahan_pagu" && input.sumber_dana_id)
    return "Penambahan pagu tidak memakai sumber dana — itu kesepakatan, bukan uang keluar";
  return null;
}

function bersihkan(input: UangJalanInput) {
  return {
    job_id: input.job_id,
    jenis: input.jenis,
    tanggal: input.tanggal,
    jumlah: Math.round(input.jumlah),
    sumber_dana_id:
      input.jenis === "pencairan" ? input.sumber_dana_id || null : null,
    keperluan: input.keperluan?.trim() || null,
    catatan: input.catatan?.trim() || null
  };
}

export async function createUangJalanAction(
  input: UangJalanInput
): Promise<ActionResult<{ id: string }>> {
  const salah = periksa(input);
  if (salah) return { ok: false, error: salah };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("uang_jalan")
    .insert({ ...bersihkan(input), created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${input.job_id}`);
  revalidatePath("/uang-jalan");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateUangJalanAction(
  id: string,
  input: UangJalanInput
): Promise<ActionResult> {
  const salah = periksa(input);
  if (salah) return { ok: false, error: salah };

  const supabase = await createClient();
  const { error } = await supabase
    .from("uang_jalan")
    .update(bersihkan(input))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${input.job_id}`);
  revalidatePath("/uang-jalan");
  return { ok: true, data: undefined };
}

export async function deleteUangJalanAction(
  id: string,
  jobId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("uang_jalan").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/uang-jalan");
  return { ok: true, data: undefined };
}

/**
 * Pagu awal disimpan di job, bukan sebagai transaksi — itu angka kesepakatan
 * di awal, bukan kejadian. Kenaikan sesudahnya dicatat sebagai transaksi
 * 'penambahan_pagu' supaya ada jejak kapan dan kenapa naiknya.
 */
export async function setPaguAction(
  jobId: string,
  pagu: number
): Promise<ActionResult> {
  if (!Number.isFinite(pagu) || pagu < 0)
    return { ok: false, error: "Pagu tidak boleh negatif" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ uang_jalan_pagu: Math.round(pagu) })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/uang-jalan");
  return { ok: true, data: undefined };
}

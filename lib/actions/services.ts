"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";
import type { JenisService } from "@/lib/types";

interface CreateServiceInput {
  unit_id: string;
  tanggal: string;        // "YYYY-MM-DD"
  odometer_km: number;
  jenis: JenisService;
  catatan?: string | null;
}

export async function createServiceAction(
  input: CreateServiceInput
): Promise<ActionResult<{ id: string }>> {
  if (!input.unit_id) return { ok: false, error: "Unit tidak valid" };
  if (!Number.isFinite(input.odometer_km) || input.odometer_km < 0) {
    return { ok: false, error: "Odometer harus angka non-negatif" };
  }
  if (!input.tanggal) return { ok: false, error: "Tanggal wajib diisi" };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data, error } = await supabase
    .from("service_records")
    .insert({
      unit_id: input.unit_id,
      tanggal: input.tanggal,
      odometer_km: input.odometer_km,
      jenis: input.jenis,
      catatan: input.catatan?.trim() || null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  revalidatePath(`/units/${input.unit_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteServiceAction(
  id: string,
  unit_id: string
): Promise<ActionResult<{ ok: true }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_records")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/services");
  revalidatePath(`/units/${unit_id}`);
  return { ok: true, data: { ok: true } };
}

interface CalibrateInput {
  unit_id: string;
  odometer_baseline_km: number;
}

export async function calibrateOdometerAction(
  input: CalibrateInput
): Promise<ActionResult<{ ok: true }>> {
  if (
    !Number.isFinite(input.odometer_baseline_km) ||
    input.odometer_baseline_km < 0
  ) {
    return { ok: false, error: "Baseline harus angka non-negatif" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({ odometer_baseline_km: input.odometer_baseline_km })
    .eq("id", input.unit_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  revalidatePath(`/units/${input.unit_id}`);
  return { ok: true, data: { ok: true } };
}

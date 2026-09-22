"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import type { IncidentStatus, IncidentType } from "@/lib/types";

interface IncidentInput {
  unit_id: string;
  job_id?: string | null;
  tipe: IncidentType;
  tanggal: string;
  lokasi?: string | null;
  deskripsi: string;
  biaya_repair?: number | null;
  vendor_repair?: string | null;
}

export async function createIncidentAction(
  input: IncidentInput
): Promise<ActionResult<{ id: string }>> {
  if (!input.unit_id) return { ok: false, error: "Unit wajib dipilih" };
  if (!input.tipe) return { ok: false, error: "Tipe insiden wajib dipilih" };
  if (!input.deskripsi?.trim())
    return { ok: false, error: "Deskripsi wajib diisi" };
  if (!input.tanggal) return { ok: false, error: "Tanggal wajib diisi" };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("incident_logs")
    .insert({
      unit_id: input.unit_id,
      job_id: input.job_id || null,
      tipe: input.tipe,
      tanggal: new Date(input.tanggal).toISOString(),
      lokasi: input.lokasi?.trim() || null,
      deskripsi: input.deskripsi.trim(),
      biaya_repair: input.biaya_repair ?? null,
      vendor_repair: input.vendor_repair?.trim() || null,
      created_by: user?.id ?? null
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/units/${input.unit_id}`);
  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateIncidentAction(
  id: string,
  input: Partial<Omit<IncidentInput, "unit_id">>
): Promise<ActionResult> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.tipe) payload.tipe = input.tipe;
  if (input.tanggal) payload.tanggal = new Date(input.tanggal).toISOString();
  if (input.lokasi !== undefined) payload.lokasi = input.lokasi?.trim() || null;
  if (input.deskripsi) payload.deskripsi = input.deskripsi.trim();
  if (input.biaya_repair !== undefined) payload.biaya_repair = input.biaya_repair ?? null;
  if (input.vendor_repair !== undefined)
    payload.vendor_repair = input.vendor_repair?.trim() || null;
  if (input.job_id !== undefined) payload.job_id = input.job_id || null;

  const { error, data } = await supabase
    .from("incident_logs")
    .update(payload)
    .eq("id", id)
    .select("unit_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const unitId = (data as { unit_id: string } | null)?.unit_id;
  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath("/units");
  return { ok: true, data: undefined };
}

export async function setIncidentStatusAction(
  id: string,
  status: IncidentStatus
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("incident_logs")
    .update({ status })
    .eq("id", id)
    .select("unit_id")
    .single();
  if (error) return { ok: false, error: error.message };
  const unitId = (data as { unit_id: string } | null)?.unit_id;
  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath("/units");
  return { ok: true, data: undefined };
}

export async function resolveIncidentAction(
  id: string,
  opts: { setUnitToStandby?: boolean }
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("incident_logs")
    .update({ status: "resolved" })
    .eq("id", id)
    .select("unit_id")
    .single();
  if (error) return { ok: false, error: error.message };

  const unitId = (row as { unit_id: string } | null)?.unit_id;

  if (opts.setUnitToStandby && unitId) {
    const { error: upErr } = await supabase
      .from("units")
      .update({ status: "standby" })
      .eq("id", unitId);
    if (upErr) return { ok: false, error: upErr.message };
  }

  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function deleteIncidentAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("incident_logs")
    .select("unit_id")
    .eq("id", id)
    .maybeSingle();
  const unitId = (row as { unit_id: string } | null)?.unit_id;

  const { error } = await supabase.from("incident_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath("/units");
  return { ok: true, data: undefined };
}

interface RegisterIncidentPhotoInput {
  incident_id: string;
  file_path: string;
  file_size: number;
}

export async function registerIncidentPhotoAction(
  input: RegisterIncidentPhotoInput
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("incident_photos")
    .insert({
      incident_id: input.incident_id,
      file_path: input.file_path,
      file_size: input.file_size,
      uploaded_by: user?.id ?? null
    })
    .select("id, incident_id")
    .single();
  if (error) return { ok: false, error: error.message };

  // revalidate via parent unit (ambil dari incident row terpisah)
  const { data: incident } = await supabase
    .from("incident_logs")
    .select("unit_id")
    .eq("id", input.incident_id)
    .maybeSingle();
  const unitId = (incident as { unit_id: string } | null)?.unit_id;
  if (unitId) revalidatePath(`/units/${unitId}`);

  return { ok: true, data: { id: (row as { id: string }).id } };
}

export async function deleteIncidentPhotoAction(
  photoId: string,
  filePath: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("incident_photos")
    .select("incident_id")
    .eq("id", photoId)
    .maybeSingle();

  const { error } = await supabase
    .from("incident_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { ok: false, error: error.message };

  await supabase.storage.from("incident-photos").remove([filePath]);

  const incidentId = (row as { incident_id: string } | null)?.incident_id;
  if (incidentId) {
    const { data: incident } = await supabase
      .from("incident_logs")
      .select("unit_id")
      .eq("id", incidentId)
      .maybeSingle();
    const unitId = (incident as { unit_id: string } | null)?.unit_id;
    if (unitId) revalidatePath(`/units/${unitId}`);
  }

  return { ok: true, data: undefined };
}

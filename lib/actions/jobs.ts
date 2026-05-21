"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listJobs } from "@/lib/queries/jobs";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/queries/job-conflicts";
import type { ActionResult } from "./auth";
import type { JobStatus } from "@/lib/types";

interface JobInput {
  customer_id: string;
  pic_nama?: string | null;
  pic_no_hp?: string | null;
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta?: string | null;
  catatan?: string | null;
}

interface MutationOptions {
  /** Set true bila admin sudah konfirmasi tetap simpan meski ada bentrok. */
  allowConflict?: boolean;
}

/**
 * Result type khusus job mutation — tambah `conflicts` di error case supaya
 * UI bisa tampilkan dialog konfirmasi tetap simpan / batal.
 */
type JobMutationResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; conflicts?: ConflictCheckResult };

function validate(input: JobInput): string | null {
  if (!input.customer_id) return "Customer wajib dipilih";
  if (!input.alat_diangkut?.trim()) return "Alat wajib diisi";
  if (!input.asal?.trim()) return "Lokasi asal wajib diisi";
  if (!input.tujuan?.trim()) return "Lokasi tujuan wajib diisi";
  if (!input.unit_id) return "Unit wajib dipilih";
  if (!input.driver_id) return "Driver wajib dipilih";
  if (!input.etd) return "ETD wajib diisi";
  if (input.pic_no_hp && !/^(08|\+628)\d{7,12}$/.test(input.pic_no_hp))
    return "Format No HP PIC: 08xxxxxxxxxx atau +628xxxxxxxxxx";
  return null;
}

async function checkConflictsServer(
  input: { unit_id: string; driver_id: string; etd: string; eta?: string | null },
  excludeJobId?: string
): Promise<ConflictCheckResult> {
  const activeJobs = await listJobs({ status: "active" });
  return findJobConflicts(
    {
      unitId: input.unit_id,
      driverId: input.driver_id,
      etd: input.etd,
      eta: input.eta ?? null,
      excludeJobId
    },
    activeJobs
  );
}

export async function createJobAction(
  input: JobInput,
  opts?: MutationOptions
): Promise<
  JobMutationResult<{ id: string; job_number: string; share_token: string }>
> {
  const err = validate(input);
  if (err) return { ok: false, error: err };

  if (!opts?.allowConflict) {
    const conflicts = await checkConflictsServer(input);
    if (conflicts.hasAny) {
      return {
        ok: false,
        error: "Bentrok jadwal terdeteksi.",
        conflicts
      };
    }
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: input.customer_id,
      pic_nama: input.pic_nama?.trim() || null,
      pic_no_hp: input.pic_no_hp?.trim() || null,
      alat_diangkut: input.alat_diangkut.trim(),
      asal: input.asal.trim(),
      tujuan: input.tujuan.trim(),
      unit_id: input.unit_id,
      driver_id: input.driver_id,
      etd: new Date(input.etd).toISOString(),
      eta: input.eta ? new Date(input.eta).toISOString() : null,
      catatan: input.catatan?.trim() || null,
      created_by: user?.id ?? null
    })
    .select("id, job_number, share_token")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/jobs");
  revalidatePath("/units");
  revalidatePath("/dashboard");
  return { ok: true, data: data as { id: string; job_number: string; share_token: string } };
}

export async function updateJobAction(
  id: string,
  input: Partial<JobInput>,
  opts?: MutationOptions
): Promise<JobMutationResult> {
  // Conflict check hanya kalau field yang relevant berubah
  const shouldCheck =
    !opts?.allowConflict &&
    (input.unit_id || input.driver_id || input.etd || input.eta !== undefined);

  if (shouldCheck) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("jobs")
      .select("unit_id, driver_id, etd, eta")
      .eq("id", id)
      .maybeSingle();
    const current = existing as {
      unit_id: string;
      driver_id: string;
      etd: string;
      eta: string | null;
    } | null;
    if (current) {
      const conflicts = await checkConflictsServer(
        {
          unit_id: input.unit_id ?? current.unit_id,
          driver_id: input.driver_id ?? current.driver_id,
          etd: input.etd ?? current.etd,
          eta:
            input.eta === undefined ? current.eta : input.eta
        },
        id
      );
      if (conflicts.hasAny) {
        return {
          ok: false,
          error: "Bentrok jadwal terdeteksi.",
          conflicts
        };
      }
    }
  }

  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.customer_id) payload.customer_id = input.customer_id;
  if (input.pic_nama !== undefined) payload.pic_nama = input.pic_nama?.trim() || null;
  if (input.pic_no_hp !== undefined) payload.pic_no_hp = input.pic_no_hp?.trim() || null;
  if (input.alat_diangkut) payload.alat_diangkut = input.alat_diangkut.trim();
  if (input.asal) payload.asal = input.asal.trim();
  if (input.tujuan) payload.tujuan = input.tujuan.trim();
  if (input.unit_id) payload.unit_id = input.unit_id;
  if (input.driver_id) payload.driver_id = input.driver_id;
  if (input.etd) payload.etd = new Date(input.etd).toISOString();
  if (input.eta !== undefined)
    payload.eta = input.eta ? new Date(input.eta).toISOString() : null;
  if (input.catatan !== undefined)
    payload.catatan = input.catatan?.trim() || null;

  const { error } = await supabase.from("jobs").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { ok: true, data: undefined };
}

export async function updateJobStatusAction(
  id: string,
  next: JobStatus,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: jobBefore } = await supabase
    .from("jobs")
    .select("share_token")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("jobs")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (notes?.trim()) {
    await supabase
      .from("job_status_history")
      .update({ notes: notes.trim() })
      .eq("job_id", id)
      .order("changed_at", { ascending: false })
      .limit(1);
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/units");
  const token = (jobBefore as { share_token: string } | null)?.share_token;
  if (token) revalidatePath(`/track/${token}`);
  return { ok: true, data: undefined };
}

export async function cancelJobAction(
  id: string,
  reason?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: jobBefore } = await supabase
    .from("jobs")
    .select("share_token")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("jobs")
    .update({ status: "cancelled", cancelled_reason: reason?.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/units");
  revalidatePath("/dashboard");
  const token = (jobBefore as { share_token: string } | null)?.share_token;
  if (token) revalidatePath(`/track/${token}`);
  redirect("/jobs");
}

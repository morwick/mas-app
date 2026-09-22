"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

interface RegisterPhotoInput {
  job_id: string;
  type: "loading" | "unloading";
  file_path: string;
  file_size: number;
}

export async function registerJobPhotoAction(
  input: RegisterPhotoInput
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("job_photos")
    .insert({
      job_id: input.job_id,
      type: input.type,
      file_path: input.file_path,
      file_size: input.file_size,
      uploaded_by: user?.id ?? null
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${input.job_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteJobPhotoAction(
  photoId: string,
  filePath: string
): Promise<ActionResult> {
  const supabase = await createClient();
  // Delete row first
  const { data: row, error: selErr } = await supabase
    .from("job_photos")
    .select("job_id")
    .eq("id", photoId)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };

  const { error: delErr } = await supabase
    .from("job_photos")
    .delete()
    .eq("id", photoId);
  if (delErr) return { ok: false, error: delErr.message };

  // Best-effort: delete storage object
  await supabase.storage.from("job-photos").remove([filePath]);

  if (row?.job_id) revalidatePath(`/jobs/${row.job_id}`);
  return { ok: true, data: undefined };
}

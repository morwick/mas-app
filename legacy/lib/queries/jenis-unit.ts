import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { JenisUnit } from "@/lib/types";

export async function listJenisUnit(): Promise<JenisUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jenis_unit")
    .select("*")
    .order("nama");
  if (error) throw new Error(error.message);
  return (data ?? []) as JenisUnit[];
}

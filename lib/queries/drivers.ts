import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Driver } from "@/lib/types";

export async function listDrivers(opts?: {
  includeInactive?: boolean;
}): Promise<Driver[]> {
  const supabase = await createClient();
  let q = supabase.from("drivers").select("*").order("nama");
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Driver[];
}

export async function activeDriversCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("drivers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getDriver(id: string): Promise<Driver | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Driver | null;
}

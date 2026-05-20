import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export async function listCustomers(opts?: {
  includeInactive?: boolean;
}): Promise<Customer[]> {
  const supabase = await createClient();
  let q = supabase.from("customers").select("*").order("nama_perusahaan");
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Customer[];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Customer | null;
}

export async function countJobsByCustomer(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").select("customer_id");
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ customer_id: string }>) {
    counts.set(r.customer_id, (counts.get(r.customer_id) ?? 0) + 1);
  }
  return counts;
}

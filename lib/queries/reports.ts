import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UtilizationRow {
  unit_id: string;
  kode_unit: string;
  jenis: string;
  hari_bertugas: number;
  hari_standby: number;
  hari_perbaikan: number;
  persentase_utilisasi: number;
}

export async function getUtilizationReport(
  startISO: string,
  endISO: string
): Promise<UtilizationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unit_utilization", {
    p_start_date: startISO,
    p_end_date: endISO
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as UtilizationRow[];
}

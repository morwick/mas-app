import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Unit,
  UnitStatus,
  UnitStatusHistoryEntry
} from "@/lib/types";

const UNIT_SELECT = `
  *,
  jenis_unit(nama),
  default_driver:drivers!units_default_driver_id_fkey(id, nama, no_hp)
`;

interface UnitRow {
  id: string;
  kode_unit: string;
  jenis_unit_id: string;
  no_polisi: string;
  tahun: number | null;
  status: UnitStatus;
  catatan: string | null;
  is_active: boolean;
  created_at: string;
  default_driver_id: string | null;
  imei_gps: string | null;
  tracksolid_share_link: string | null;
  odometer_baseline_km: number | string | null;
  current_odometer_km: number | string | null;
  service_interval_km: number | null;
  jenis_unit: { nama: string } | null;
  default_driver: { id: string; nama: string; no_hp: string } | null;
}

function toNum(v: number | string | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    kode_unit: row.kode_unit,
    jenis_unit_id: row.jenis_unit_id,
    jenis_unit_nama: row.jenis_unit?.nama ?? "—",
    no_polisi: row.no_polisi,
    tahun: row.tahun,
    status: row.status,
    catatan: row.catatan,
    is_active: row.is_active,
    created_at: row.created_at,
    default_driver_id: row.default_driver_id,
    default_driver_nama: row.default_driver?.nama ?? null,
    default_driver_no_hp: row.default_driver?.no_hp ?? null,
    imei_gps: row.imei_gps,
    tracksolid_share_link: row.tracksolid_share_link,
    odometer_baseline_km: toNum(row.odometer_baseline_km),
    current_odometer_km: toNum(row.current_odometer_km),
    service_interval_km: toNum(row.service_interval_km, 10000)
  };
}

export async function listUnits(opts?: {
  includeInactive?: boolean;
}): Promise<Unit[]> {
  const supabase = await createClient();
  let q = supabase
    .from("units")
    .select(UNIT_SELECT)
    .order("kode_unit", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapUnit(r as unknown as UnitRow));
}

export async function getUnit(id: string): Promise<Unit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(UNIT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapUnit(data as unknown as UnitRow);
}

export async function getUnitStatusHistory(
  unitId: string
): Promise<UnitStatusHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unit_status_history")
    .select("*, profiles(nama)")
    .eq("unit_id", unitId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    unit_id: r.unit_id,
    status_old: r.status_old,
    status_new: r.status_new,
    changed_by_nama: r.profiles?.nama ?? "Sistem",
    changed_at: r.changed_at,
    reason: r.reason
  }));
}

export interface DriverAssignment {
  unit_id: string;
  kode_unit: string;
}

/**
 * Map driverId → unit yang sedang memakai driver itu sebagai default driver.
 * Hanya unit aktif yang dihitung.
 */
export async function getDriverAssignments(): Promise<
  Record<string, DriverAssignment>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, kode_unit, default_driver_id")
    .eq("is_active", true)
    .not("default_driver_id", "is", null);
  if (error) throw new Error(error.message);
  const map: Record<string, DriverAssignment> = {};
  for (const row of (data ?? []) as Array<{
    id: string;
    kode_unit: string;
    default_driver_id: string;
  }>) {
    map[row.default_driver_id] = {
      unit_id: row.id,
      kode_unit: row.kode_unit
    };
  }
  return map;
}

export async function activeUnitsCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function unitStatusCounts(): Promise<{
  standby: number;
  bertugas: number;
  perbaikan: number;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("status")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const counts = { standby: 0, bertugas: 0, perbaikan: 0 };
  for (const r of data ?? []) counts[(r as any).status as UnitStatus]++;
  return counts;
}

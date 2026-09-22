import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ServiceRecord } from "@/lib/types";

const SERVICE_SELECT = `
  id,
  unit_id,
  tanggal,
  odometer_km,
  jenis,
  catatan,
  created_at,
  units(kode_unit),
  profiles!service_records_created_by_fkey(nama)
`;

interface ServiceRow {
  id: string;
  unit_id: string;
  tanggal: string;
  odometer_km: number | string;
  jenis: ServiceRecord["jenis"];
  catatan: string | null;
  created_at: string;
  units: { kode_unit: string } | null;
  profiles: { nama: string } | null;
}

function mapService(r: ServiceRow): ServiceRecord {
  const odo =
    typeof r.odometer_km === "number" ? r.odometer_km : Number(r.odometer_km);
  return {
    id: r.id,
    unit_id: r.unit_id,
    unit_kode: r.units?.kode_unit ?? "",
    tanggal: r.tanggal,
    odometer_km: Number.isFinite(odo) ? odo : 0,
    jenis: r.jenis,
    catatan: r.catatan,
    created_by_nama: r.profiles?.nama ?? "Sistem",
    created_at: r.created_at
  };
}

export async function listServiceRecordsByUnit(
  unitId: string
): Promise<ServiceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_records")
    .select(SERVICE_SELECT)
    .eq("unit_id", unitId)
    .order("tanggal", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapService(r as unknown as ServiceRow));
}

/**
 * Ambil last_service odometer per unit dalam satu round-trip.
 * Dipakai di halaman /services untuk hitung status tanpa N+1 query.
 */
export async function listLastServiceOdometerMap(
  unitIds: string[]
): Promise<Map<string, number>> {
  if (unitIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_records")
    .select("unit_id, odometer_km")
    .in("unit_id", unitIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as Array<{
    unit_id: string;
    odometer_km: number | string;
  }>) {
    const n = typeof r.odometer_km === "number" ? r.odometer_km : Number(r.odometer_km);
    if (!Number.isFinite(n)) continue;
    const cur = map.get(r.unit_id);
    if (cur === undefined || n > cur) map.set(r.unit_id, n);
  }
  return map;
}

export async function getLastServiceOdometer(
  unitId: string
): Promise<number | null> {
  const map = await listLastServiceOdometerMap([unitId]);
  return map.get(unitId) ?? null;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Incident, IncidentPhoto } from "@/lib/types";

const INCIDENT_SELECT = `
  id, unit_id, job_id, tipe, tanggal, lokasi, deskripsi,
  biaya_repair, vendor_repair, status, resolved_at, created_at,
  unit:units(kode_unit),
  job:jobs(job_number),
  creator:profiles(nama),
  photos:incident_photos(id, file_path, uploaded_at)
`;

interface IncidentRow {
  id: string;
  unit_id: string;
  job_id: string | null;
  tipe: Incident["tipe"];
  tanggal: string;
  lokasi: string | null;
  deskripsi: string;
  biaya_repair: number | string | null;
  vendor_repair: string | null;
  status: Incident["status"];
  resolved_at: string | null;
  created_at: string;
  unit: { kode_unit: string } | null;
  job: { job_number: string } | null;
  creator: { nama: string } | null;
  photos: Array<{ id: string; file_path: string; uploaded_at: string }> | null;
}

function incidentPhotoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/incident-photos/${path}`;
}

function mapIncident(row: IncidentRow): Incident {
  const photos: IncidentPhoto[] = (row.photos ?? []).map((p) => ({
    id: p.id,
    incident_id: row.id,
    file_path: p.file_path,
    file_url: incidentPhotoUrl(p.file_path),
    uploaded_at: p.uploaded_at
  }));
  return {
    id: row.id,
    unit_id: row.unit_id,
    unit_kode: row.unit?.kode_unit,
    job_id: row.job_id,
    job_number: row.job?.job_number ?? null,
    tipe: row.tipe,
    tanggal: row.tanggal,
    lokasi: row.lokasi,
    deskripsi: row.deskripsi,
    biaya_repair:
      row.biaya_repair === null || row.biaya_repair === undefined
        ? null
        : Number(row.biaya_repair),
    vendor_repair: row.vendor_repair,
    status: row.status,
    resolved_at: row.resolved_at,
    created_by_nama: row.creator?.nama ?? null,
    created_at: row.created_at,
    photos
  };
}

export async function listIncidentsByUnit(unitId: string): Promise<Incident[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_logs")
    .select(INCIDENT_SELECT)
    .eq("unit_id", unitId)
    .order("tanggal", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapIncident(r as unknown as IncidentRow));
}

export async function getIncident(id: string): Promise<Incident | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_logs")
    .select(INCIDENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapIncident(data as unknown as IncidentRow) : null;
}

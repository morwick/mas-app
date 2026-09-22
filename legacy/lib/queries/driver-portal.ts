import "server-only";
import { createDriverClient } from "@/lib/supabase/server";
import { getDriverToken } from "@/lib/driver-session";
import type { Job } from "@/lib/types";

/**
 * Query portal driver.
 *
 * Tidak ada satu pun fungsi di sini yang menerima driver_id dari pemanggil.
 * Baris yang boleh terbaca ditentukan RLS lewat token sesi di cookie, jadi
 * halaman tidak bisa keliru (atau dipaksa) membuka job milik driver lain.
 */

const JOB_SELECT = `
  id, job_number, share_token, customer_id, pic_nama, pic_no_hp,
  alat_diangkut, asal, tujuan,
  asal_lat, asal_lng, tujuan_lat, tujuan_lng,
  route_polyline, route_distance_km, route_duration_min,
  unit_id, driver_id, etd, eta,
  status, catatan, cancelled_reason, accepted_at,
  pod_penerima_nama, pod_penerima_jabatan, pod_signature_path,
  pod_catatan, pod_at,
  created_at, completed_at,
  customer:customers(nama_perusahaan),
  photos:job_photos(id, type, file_path, uploaded_at),
  unit:units(kode_unit, no_polisi)
`;

export type DriverJob = Job & {
  unit_kode?: string;
  unit_no_polisi?: string;
};

interface JobRow {
  id: string;
  job_number: string;
  share_token: string;
  customer_id: string;
  pic_nama: string | null;
  pic_no_hp: string | null;
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  asal_lat: number | string | null;
  asal_lng: number | string | null;
  tujuan_lat: number | string | null;
  tujuan_lng: number | string | null;
  route_polyline: string | null;
  route_distance_km: number | string | null;
  route_duration_min: number | string | null;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta: string | null;
  status: string;
  catatan: string | null;
  cancelled_reason: string | null;
  accepted_at: string | null;
  pod_penerima_nama: string | null;
  pod_penerima_jabatan: string | null;
  pod_signature_path: string | null;
  pod_catatan: string | null;
  pod_at: string | null;
  created_at: string;
  completed_at: string | null;
  customer: { nama_perusahaan: string } | null;
  photos: Array<{
    id: string;
    type: "loading" | "unloading";
    file_path: string;
    uploaded_at: string;
  }> | null;
  unit: { kode_unit: string; no_polisi: string } | null;
}

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/job-photos/${path}`;
}

function mapJob(row: JobRow): DriverJob {
  const photos: Job["photos"] = (row.photos ?? []).map((p) => ({
    id: p.id,
    job_id: row.id,
    type: p.type,
    file_path: p.file_path,
    file_url: publicUrlFor(p.file_path),
    uploaded_at: p.uploaded_at
  }));
  return {
    id: row.id,
    job_number: row.job_number,
    share_token: row.share_token,
    customer_id: row.customer_id,
    customer_nama: row.customer?.nama_perusahaan ?? "—",
    pic_nama: row.pic_nama,
    pic_no_hp: row.pic_no_hp,
    alat_diangkut: row.alat_diangkut,
    asal: row.asal,
    tujuan: row.tujuan,
    asal_lat: toNum(row.asal_lat),
    asal_lng: toNum(row.asal_lng),
    tujuan_lat: toNum(row.tujuan_lat),
    tujuan_lng: toNum(row.tujuan_lng),
    route_polyline: row.route_polyline,
    route_distance_km: toNum(row.route_distance_km),
    route_duration_min: toNum(row.route_duration_min),
    unit_id: row.unit_id,
    driver_id: row.driver_id,
    etd: row.etd,
    eta: row.eta,
    status: row.status as Job["status"],
    catatan: row.catatan,
    cancelled_reason: row.cancelled_reason,
    accepted_at: row.accepted_at,
    pod_penerima_nama: row.pod_penerima_nama,
    pod_penerima_jabatan: row.pod_penerima_jabatan,
    pod_signature_path: row.pod_signature_path,
    pod_signature_url: row.pod_signature_path
      ? publicUrlFor(row.pod_signature_path)
      : null,
    pod_catatan: row.pod_catatan,
    pod_at: row.pod_at,
    created_at: row.created_at,
    completed_at: row.completed_at,
    photos,
    unit_kode: row.unit?.kode_unit,
    unit_no_polisi: row.unit?.no_polisi
  };
}

async function driverClient() {
  const token = await getDriverToken();
  return createDriverClient(token ?? undefined);
}

/** Semua job milik driver yang sedang login. */
export async function getMyJobs(opts?: {
  status?: "active" | "all";
}): Promise<DriverJob[]> {
  const supabase = await driverClient();
  let q = supabase
    .from("jobs")
    .select(JOB_SELECT)
    // Belum dikonfirmasi lebih dulu, lalu yang paling dekat berangkat.
    // Urutan created_at tidak berguna di HP driver: yang dia butuhkan adalah
    // job mana yang harus dikerjakan sekarang.
    .order("accepted_at", { ascending: true, nullsFirst: true })
    .order("etd", { ascending: true });

  if (opts?.status === "active") {
    q = q.in("status", [
      "menunggu_pickup",
      "loading",
      "dalam_perjalanan",
      "unloading"
    ]);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapJob(r as unknown as JobRow));
}

/** Satu job milik driver yang sedang login. RLS yang menyaring, bukan filter. */
export async function getMyJob(jobId: string): Promise<DriverJob | null> {
  const supabase = await driverClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data as unknown as JobRow) : null;
}

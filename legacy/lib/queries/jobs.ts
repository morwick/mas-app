import "server-only";
import { createClient, createAnonClient } from "@/lib/supabase/server";
import type {
  Job,
  JobPhoto,
  JobStatus,
  JobStatusHistoryEntry
} from "@/lib/types";

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
  uang_jalan_pagu,
  quotation_id,
  quotation:quotations(quote_number),
  customer:customers(nama_perusahaan),
  photos:job_photos(id, type, file_path, uploaded_at)
`;

/**
 * Select untuk akses publik lewat share token.
 *
 * Sengaja tidak memakai JOB_SELECT: kolom uang jalan di sana angka internal,
 * dan halaman pelacakan dibuka customer. Kalau kedua select ini disatukan
 * lagi, pagu uang jalan ikut terkirim ke luar.
 */
const PUBLIC_JOB_SELECT = JOB_SELECT.replace("  uang_jalan_pagu,\n", "");

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
  uang_jalan_pagu: number | string | null;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta: string | null;
  status: JobStatus;
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
  quotation_id: string | null;
  // Supabase mengetikkan embed to-one sebagai array; kedua bentuk ditampung.
  quotation:
    | { quote_number: string }
    | Array<{ quote_number: string }>
    | null;
  customer: { nama_perusahaan: string } | null;
  photos: Array<{
    id: string;
    type: "loading" | "unloading";
    file_path: string;
    uploaded_at: string;
  }> | null;
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

function mapJob(row: JobRow): Job {
  const photos: JobPhoto[] = (row.photos ?? []).map((p) => ({
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
    uang_jalan_pagu: Number(row.uang_jalan_pagu ?? 0),
    unit_id: row.unit_id,
    driver_id: row.driver_id,
    etd: row.etd,
    eta: row.eta,
    status: row.status,
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
    quotation_id: row.quotation_id,
    quotation_number: (() => {
      const q = row.quotation;
      if (!q) return null;
      return (Array.isArray(q) ? q[0] : q)?.quote_number ?? null;
    })(),
    photos
  };
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "menunggu_pickup",
  "loading",
  "dalam_perjalanan",
  "unloading"
];

export async function activeJobsCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_JOB_STATUSES);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listJobs(opts?: {
  status?: "active" | "selesai" | "cancelled" | "all";
  customerId?: string;
}): Promise<Job[]> {
  const supabase = await createClient();
  let q = supabase
    .from("jobs")
    .select(JOB_SELECT)
    .order("created_at", { ascending: false });
  if (opts?.status === "active") q = q.in("status", ACTIVE_JOB_STATUSES);
  if (opts?.status === "selesai") q = q.eq("status", "selesai");
  if (opts?.status === "cancelled") q = q.eq("status", "cancelled");
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapJob(r as unknown as JobRow));
}

export async function getJob(id: string): Promise<Job | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data as unknown as JobRow) : null;
}

export async function getJobByToken(token: string): Promise<Job | null> {
  // Public access — pakai anon client supaya tidak ada session cookies.
  const supabase = createAnonClient(token);
  const { data, error } = await supabase
    .from("jobs")
    .select(PUBLIC_JOB_SELECT)
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data as unknown as JobRow) : null;
}

export async function getActiveJobsByUnit(): Promise<Map<string, Job>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .in("status", ACTIVE_JOB_STATUSES);
  if (error) throw new Error(error.message);
  const map = new Map<string, Job>();
  for (const row of (data ?? []) as unknown as JobRow[]) {
    map.set(row.unit_id, mapJob(row));
  }
  return map;
}

/**
 * Job yang menyentuh sebuah rentang tanggal, untuk papan jadwal.
 *
 * Sebuah job dianggap menyentuh rentang bila jadwalnya beririsan sama sekali —
 * bukan hanya kalau ETD-nya berada di dalamnya. Tanpa itu, perjalanan lintas
 * minggu akan hilang dari papan tepat pada minggu ia sedang berjalan.
 *
 * Job tanpa ETA diperlakukan sebagai satu hari sejak ETD: itu asumsi yang
 * paling tidak menyesatkan — menganggapnya tak berujung akan memenuhi papan,
 * menganggapnya nol menit akan menyembunyikannya.
 */
export async function listJobsInRange(
  start: string,
  end: string
): Promise<Job[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .neq("status", "cancelled")
    .lte("etd", `${end}T23:59:59`)
    .order("etd", { ascending: true });
  if (error) throw new Error(error.message);

  const startMs = new Date(`${start}T00:00:00`).getTime();
  return (data ?? [])
    .map((r) => mapJob(r as unknown as JobRow))
    .filter((j) => {
      const akhir = j.eta
        ? new Date(j.eta).getTime()
        : new Date(j.etd).getTime() + 86_400_000;
      return akhir >= startMs;
    });
}

export async function getJobsByUnit(unitId: string): Promise<Job[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapJob(r as unknown as JobRow));
}

export async function getJobStatusHistory(
  jobId: string
): Promise<JobStatusHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_status_history")
    .select("*, profiles(nama), driver:drivers(nama)")
    .eq("job_id", jobId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    job_id: r.job_id,
    status_old: r.status_old,
    status_new: r.status_new,
    // Perubahan dari portal driver dulu tercatat sebagai "Sistem" karena
    // changed_by hanya menunjuk ke user admin. Sekarang pelakunya terbaca.
    changed_by_nama:
      r.driver?.nama ?? r.profiles?.nama ?? "Sistem",
    changed_by_driver: Boolean(r.changed_by_driver),
    changed_at: r.changed_at,
    notes: r.notes
  }));
}

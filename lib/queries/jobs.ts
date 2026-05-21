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
  alat_diangkut, asal, tujuan, unit_id, driver_id, etd, eta,
  status, catatan, cancelled_reason,
  created_at, completed_at,
  customer:customers(nama_perusahaan),
  photos:job_photos(id, type, file_path, uploaded_at)
`;

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
  unit_id: string;
  driver_id: string;
  etd: string;
  eta: string | null;
  status: JobStatus;
  catatan: string | null;
  cancelled_reason: string | null;
  created_at: string;
  completed_at: string | null;
  customer: { nama_perusahaan: string } | null;
  photos: Array<{
    id: string;
    type: "loading" | "unloading";
    file_path: string;
    uploaded_at: string;
  }> | null;
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
    unit_id: row.unit_id,
    driver_id: row.driver_id,
    etd: row.etd,
    eta: row.eta,
    status: row.status,
    catatan: row.catatan,
    cancelled_reason: row.cancelled_reason,
    created_at: row.created_at,
    completed_at: row.completed_at,
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
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
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
    .select("*, profiles(nama)")
    .eq("job_id", jobId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    job_id: r.job_id,
    status_old: r.status_old,
    status_new: r.status_new,
    changed_by_nama: r.profiles?.nama ?? "Sistem",
    changed_at: r.changed_at,
    notes: r.notes
  }));
}

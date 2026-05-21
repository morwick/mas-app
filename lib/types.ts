// Domain types yang dipakai di seluruh aplikasi. Sebagian besar shape
// mengikuti row dari Supabase dengan join name flattening untuk kemudahan UI.

export type UnitStatus = "standby" | "bertugas" | "perbaikan";

export type JobStatus =
  | "menunggu_pickup"
  | "loading"
  | "dalam_perjalanan"
  | "unloading"
  | "selesai"
  | "cancelled";

export interface JenisUnit {
  id: string;
  nama: string;
  is_active: boolean;
}

export interface Unit {
  id: string;
  kode_unit: string;
  jenis_unit_id: string;
  jenis_unit_nama: string;
  no_polisi: string;
  tahun?: number | null;
  status: UnitStatus;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
  default_driver_id?: string | null;
  default_driver_nama?: string | null;
  default_driver_no_hp?: string | null;
  imei_gps?: string | null;
  tracksolid_share_link?: string | null;
}

export interface Driver {
  id: string;
  nama: string;
  no_hp: string;
  no_sim?: string | null;
  alamat?: string | null;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  nama_perusahaan: string;
  alamat?: string | null;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  type: "loading" | "unloading";
  file_path: string;
  file_url: string;
  uploaded_at: string;
}

export interface JobStatusHistoryEntry {
  id: string;
  job_id: string;
  status_old: JobStatus | null;
  status_new: JobStatus;
  changed_by_nama: string;
  changed_at: string;
  notes?: string | null;
}

export interface UnitStatusHistoryEntry {
  id: string;
  unit_id: string;
  status_old: UnitStatus | null;
  status_new: UnitStatus;
  changed_by_nama: string;
  changed_at: string;
  reason?: string | null;
}

export interface Job {
  id: string;
  job_number: string;
  share_token: string;
  customer_id: string;
  customer_nama: string;
  pic_nama?: string | null;
  pic_no_hp?: string | null;
  alat_diangkut: string;
  asal: string;
  tujuan: string;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta?: string | null;
  status: JobStatus;
  catatan?: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  completed_at?: string | null;
  photos?: JobPhoto[];
}

export type IncidentType = "kecelakaan" | "kerusakan" | "breakdown" | "lainnya";
export type IncidentStatus = "open" | "in_progress" | "resolved";

export interface IncidentPhoto {
  id: string;
  incident_id: string;
  file_path: string;
  file_url: string;
  uploaded_at: string;
}

export interface Incident {
  id: string;
  unit_id: string;
  unit_kode?: string;
  job_id?: string | null;
  job_number?: string | null;
  tipe: IncidentType;
  tanggal: string;
  lokasi?: string | null;
  deskripsi: string;
  biaya_repair?: number | null;
  vendor_repair?: string | null;
  status: IncidentStatus;
  resolved_at?: string | null;
  created_by_nama?: string | null;
  created_at: string;
  photos: IncidentPhoto[];
}

export const incidentTypeLabel: Record<IncidentType, string> = {
  kecelakaan: "Kecelakaan",
  kerusakan: "Kerusakan",
  breakdown: "Breakdown",
  lainnya: "Lainnya"
};

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  open: "Terbuka",
  in_progress: "Dalam penanganan",
  resolved: "Selesai"
};

export const jobStatusOrder: Array<{ key: JobStatus; label: string }> = [
  { key: "menunggu_pickup", label: "Menunggu pickup" },
  { key: "loading", label: "Loading" },
  { key: "dalam_perjalanan", label: "Dalam perjalanan" },
  { key: "unloading", label: "Unloading" },
  { key: "selesai", label: "Selesai" }
];

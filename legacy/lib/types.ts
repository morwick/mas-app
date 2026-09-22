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
  // Odometer fields — di-load dari DB sejak migration 20260522. Default 0
  // untuk unit lama yang belum dikalibrasi.
  odometer_baseline_km: number;
  current_odometer_km: number;
  service_interval_km: number;
  // Dokumen kendaraan — tanggal saja (YYYY-MM-DD), karena masa berlaku
  // berakhir pada tanggal, bukan pada jam tertentu.
  stnk_nomor?: string | null;
  stnk_berlaku_sampai?: string | null;
  kir_nomor?: string | null;
  kir_berlaku_sampai?: string | null;
  pajak_berlaku_sampai?: string | null;
}

export interface Driver {
  id: string;
  nama: string;
  no_hp: string;
  no_sim?: string | null;
  /** Tanggal habis berlaku SIM (YYYY-MM-DD). Null = belum dicatat. */
  sim_berlaku_sampai?: string | null;
  alamat?: string | null;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
  /** Kapan PIN portal driver terakhir di-set. Null = driver belum bisa login. */
  pin_updated_at?: string | null;
}

export interface Customer {
  id: string;
  nama_perusahaan: string;
  alamat?: string | null;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
  // Legalitas & billing — sebelum migration 20260804 field ini diketik ulang
  // tiap order lalu ditumpuk ke jobs.catatan sebagai teks bebas.
  kota?: string | null;
  npwp?: string | null;
  nib?: string | null;
  status_pkp?: boolean;
  termin_hari?: number | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  pic_jabatan?: string | null;
  pic_no_hp?: string | null;
  pic_email?: string | null;
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
  /** True bila perubahan datang dari portal driver, bukan dari admin. */
  changed_by_driver: boolean;
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
  asal_lat?: number | null;
  asal_lng?: number | null;
  tujuan_lat?: number | null;
  tujuan_lng?: number | null;
  route_polyline?: string | null;
  route_distance_km?: number | null;
  route_duration_min?: number | null;
  /** Borongan uang jalan yang disepakati di awal. */
  uang_jalan_pagu?: number | null;
  unit_id: string;
  driver_id: string;
  etd: string;
  eta?: string | null;
  status: JobStatus;
  catatan?: string | null;
  cancelled_reason?: string | null;
  /** Kapan driver menekan "Terima Job" di portal. Null = belum dikonfirmasi. */
  accepted_at?: string | null;
  // Bukti terima barang (e-POD) — diisi driver saat bongkar di lokasi.
  pod_penerima_nama?: string | null;
  pod_penerima_jabatan?: string | null;
  pod_signature_path?: string | null;
  pod_signature_url?: string | null;
  pod_catatan?: string | null;
  pod_at?: string | null;
  created_at: string;
  completed_at?: string | null;
  /** Penawaran asal job ini. Null untuk job yang dibuat langsung tanpa penawaran. */
  quotation_id?: string | null;
  quotation_number?: string | null;
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

// ─── Service / Maintenance ──────────────────────────────────────────────────
// Field odometer & last service belum dipersist ke Supabase; di fase ini
// di-derive dari mock helper di lib/mock-services.ts. Saat backend siap, isi
// dari kolom tabel `units` (lihat plan service tracking).
export type JenisService = "rutin" | "oli" | "ban" | "mesin" | "lainnya";

export const jenisServiceLabel: Record<JenisService, string> = {
  rutin: "Servis Rutin",
  oli: "Ganti Oli",
  ban: "Ganti Ban",
  mesin: "Servis Mesin",
  lainnya: "Lainnya"
};

export interface ServiceRecord {
  id: string;
  unit_id: string;
  unit_kode: string;
  tanggal: string;
  odometer_km: number;
  jenis: JenisService;
  catatan?: string | null;
  created_by_nama: string;
  created_at: string;
}

export type ServiceStatus = "ok" | "mendekati" | "overdue";

export const serviceStatusLabel: Record<ServiceStatus, string> = {
  ok: "OK",
  mendekati: "Mendekati",
  overdue: "Overdue"
};

// last_service_odometer_km di-derive dari MAX(odometer_km) di service_records,
// tidak disimpan di tabel units.
export interface UnitServiceInfo {
  current_odometer_km: number;
  last_service_odometer_km: number | null;
  service_interval_km: number;
}

// Unit + last_service (yang di-fetch terpisah). Komponen UI pakai shape ini.
export type UnitWithService = Unit & {
  last_service_odometer_km: number | null;
};

// ─── Penawaran (Surat Penawaran) ────────────────────────────────────────────
// Menggantikan alur ketik-manual di Word. Nomor surat mengikuti format arsip
// berjalan: 0018/SK/MAS/VIII/2026.

export type QuotationStatus =
  | "draft"
  | "terkirim"
  | "deal"
  | "ditolak"
  | "kedaluwarsa";

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  draft: "Draft",
  terkirim: "Terkirim",
  deal: "Deal",
  ditolak: "Ditolak",
  kedaluwarsa: "Kedaluwarsa"
};

export interface QuotationItem {
  id: string;
  quotation_id: string;
  urutan: number;
  dari: string;
  tujuan: string;
  qty: number;
  satuan: string;
  nama_alat?: string | null;
  harga_satuan: number;
  /** Dihitung database (qty x harga_satuan), tidak pernah dikirim client. */
  subtotal: number;
}

export interface Quotation {
  id: string;
  quote_number: string;
  seq_no: number;
  seq_tahun: number;

  customer_id: string;
  /** Snapshot saat surat dibuat — sengaja tidak ikut berubah kalau master di-edit. */
  customer_nama: string;
  customer_kota?: string | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;

  kota_terbit: string;
  tanggal: string;
  berlaku_sampai?: string | null;
  perihal: string;
  objek?: string | null;
  lampiran?: string | null;

  ppn_aktif: boolean;
  ppn_persen: number;
  subtotal: number;
  ppn_nominal: number;
  total: number;

  status: QuotationStatus;
  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  /** Catatan internal — tidak ikut tercetak di surat. */
  catatan?: string | null;
  alasan_ditolak?: string | null;

  sent_at?: string | null;
  decided_at?: string | null;

  created_by_nama?: string | null;
  created_at: string;
  updated_at: string;

  items: QuotationItem[];
}

/** Baris untuk halaman daftar — tanpa items, supaya query-nya ringan. */
export type QuotationListRow = Omit<Quotation, "items"> & {
  jumlah_item: number;
  /** Job yang sudah dibuat dari penawaran ini, tidak termasuk yang dibatalkan. */
  jumlah_job: number;
  jumlah_job_selesai: number;
};

/** Ringkasan job yang lahir dari sebuah penawaran. */
export interface QuotationJobRef {
  id: string;
  job_number: string;
  status: JobStatus;
  asal: string;
  tujuan: string;
  etd: string;
}

// ---------------------------------------------------------------------------
// Uang jalan
// ---------------------------------------------------------------------------

/** Kas/rekening tempat uang jalan dikeluarkan — "BRI Rika", "Mandiri DJ", dst. */
export interface SumberDana {
  id: string;
  nama: string;
  bank?: string | null;
  pemegang?: string | null;
  /** Huruf kolom di laporan Excel, dipakai saat ekspor. */
  kolom_excel?: string | null;
  urutan: number;
  is_active: boolean;
}

export type UangJalanJenis = "pencairan" | "penambahan_pagu";

export const uangJalanJenisLabel: Record<UangJalanJenis, string> = {
  pencairan: "Dikasih",
  penambahan_pagu: "Tambah pagu"
};

export interface UangJalan {
  id: string;
  job_id: string;
  jenis: UangJalanJenis;
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  sumber_dana_nama?: string | null;
  keperluan?: string | null;
  catatan?: string | null;
  created_by_nama?: string | null;
  created_at: string;
}

/**
 * Ringkasan uang jalan sebuah job. Semua angka diturunkan dari riwayat,
 * tidak ada yang disimpan — jadi tidak bisa berbeda dari kejadiannya.
 */
export interface UangJalanRingkasan {
  /** Borongan awal yang disepakati. */
  pagu_awal: number;
  /** Total kesepakatan tambahan sesudahnya. */
  penambahan: number;
  /** pagu_awal + penambahan */
  pagu: number;
  /** Total yang sudah benar-benar cair. */
  cair: number;
  /** pagu - cair. Negatif berarti cair melebihi pagu. */
  sisa: number;
  /** Porsi uang jalan terhadap pagu, untuk indikator cepat. */
  persen_cair: number;
}

// ---------------------------------------------------------------------------
// Invoice & piutang
// ---------------------------------------------------------------------------

export type InvoiceStatus = "draft" | "terkirim" | "lunas" | "batal";

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  draft: "Draft",
  terkirim: "Terkirim",
  lunas: "Lunas",
  batal: "Batal"
};

/**
 * Status yang ditampilkan, bukan yang disimpan.
 *
 * "Jatuh tempo" diturunkan dari tanggal saat dibaca — sama seperti
 * `kedaluwarsa` pada penawaran. Kalau disimpan, harus ada proses harian yang
 * memutakhirkannya, dan status akan salah setiap kali proses itu gagal jalan.
 */
export type InvoiceTampilStatus = InvoiceStatus | "jatuh_tempo";

export const invoiceTampilStatusLabel: Record<InvoiceTampilStatus, string> = {
  ...invoiceStatusLabel,
  jatuh_tempo: "Jatuh tempo"
};

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  urutan: number;
  /** Job yang ditagihkan baris ini. Null untuk baris di luar job. */
  job_id?: string | null;
  job_number?: string | null;
  deskripsi: string;
  dari?: string | null;
  tujuan?: string | null;
  qty: number;
  satuan: string;
  harga_satuan: number;
  /** Dihitung database (qty x harga_satuan), tidak pernah dikirim client. */
  subtotal: number;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  sumber_dana_nama?: string | null;
  metode: string;
  referensi?: string | null;
  catatan?: string | null;
  created_by_nama?: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  seq_no: number;
  seq_tahun: number;

  customer_id: string;
  /** Snapshot saat tagihan dibuat — sengaja tidak ikut berubah kalau master di-edit. */
  customer_nama: string;
  customer_alamat?: string | null;
  customer_npwp?: string | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;

  quotation_id?: string | null;
  quotation_number?: string | null;

  kota_terbit: string;
  tanggal: string;
  termin_hari?: number | null;
  jatuh_tempo?: string | null;

  ppn_aktif: boolean;
  ppn_persen: number;
  subtotal: number;
  ppn_nominal: number;
  total: number;
  /** Jumlah pembayaran masuk. Diisi database dari invoice_payments. */
  dibayar: number;
  /** total - dibayar. Diturunkan, tidak disimpan. */
  sisa: number;

  status: InvoiceStatus;
  /** Status untuk ditampilkan; termasuk `jatuh_tempo` yang diturunkan tanggal. */
  status_tampil: InvoiceTampilStatus;
  /** Berapa hari lewat jatuh tempo. Null bila belum/tidak jatuh tempo. */
  hari_terlambat?: number | null;

  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  bank_nama?: string | null;
  bank_rekening?: string | null;
  bank_atas_nama?: string | null;
  catatan?: string | null;
  alasan_batal?: string | null;

  sent_at?: string | null;
  lunas_at?: string | null;
  created_by_nama?: string | null;
  created_at: string;
  updated_at: string;

  items: InvoiceItem[];
  payments: InvoicePayment[];
}

export type InvoiceListRow = Omit<Invoice, "items" | "payments"> & {
  jumlah_item: number;
};

/** Satu baris per customer di halaman piutang, dari get_piutang_summary(). */
export interface PiutangSummaryRow {
  customer_id: string;
  customer_nama: string;
  jumlah_invoice: number;
  total_tagihan: number;
  total_dibayar: number;
  sisa: number;
  belum_jatuh_tempo: number;
  umur_1_30: number;
  umur_31_60: number;
  umur_60_plus: number;
}

/** Satu baris per job di laporan laba, dari get_job_profitability(). */
export interface JobProfitabilityRow {
  job_id: string;
  job_number: string;
  customer_nama: string;
  unit_kode: string;
  etd: string;
  status: JobStatus;
  /** Nilai baris invoice untuk job ini, di luar PPN. */
  pendapatan: number;
  /** Uang jalan yang benar-benar cair. */
  uang_jalan: number;
  biaya_insiden: number;
  laba: number;
}

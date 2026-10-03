// Tipe domain yang dipakai di seluruh aplikasi. Bentuknya mengikuti skema
// respons API backend (Pydantic) — kolom dan namanya sama persis.

export type UnitStatus =
  | "standby"
  | "bertugas"
  | "breakdown"
  | "perbaikan"
  | "terjual"
  | "diafkirkan";

export type JobStatus =
  | "menunggu_pickup" // nilai lama, tidak dipakai lagi setelah migrasi v2
  | "ditugaskan"
  | "diterima"
  | "loading"
  | "dalam_perjalanan"
  | "unloading"
  | "serah_terima_pool"
  | "menunggu_validasi"
  | "selesai"
  | "cancelled";

export type PhotoStage = "loading" | "unloading" | "serah_terima";
export type PhotoSlot = "depan" | "belakang" | "kanan" | "kiri" | "surat_jalan" | "serah_terima";
export type DriverStatus = "stand_by" | "in_job";

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
  /** Scan/foto dokumen (opsional). `*_url` = signed URL, hanya terisi di detail unit. */
  stnk_uploaded_at?: string | null;
  stnk_url?: string | null;
  kir_uploaded_at?: string | null;
  kir_url?: string | null;
  /** Polis asuransi terkini (berlaku hari ini, atau yang terakhir). Hanya di detail unit. */
  polis_terkini?: import("@/features/asuransi/api").PolisAsuransi | null;
}

export interface Driver {
  id: string;
  /** Mengikuti nama karyawan (hr.karyawan). */
  nama: string;
  karyawan_id?: string | null;
  no_hp: string;
  no_sim?: string | null;
  /** Tanggal habis berlaku SIM (YYYY-MM-DD). Null = belum dicatat. */
  sim_berlaku_sampai?: string | null;
  /** Dokumen SIM (opsional). `sim_url` = signed URL, hanya terisi di detail driver. */
  sim_uploaded_at?: string | null;
  sim_url?: string | null;
  alamat?: string | null;
  catatan?: string | null;
  is_active: boolean;
  created_at: string;
  /** Kapan PIN portal driver terakhir di-set. Null = driver belum bisa login. */
  pin_updated_at?: string | null;
  /** BR-01: diturunkan dari job aktif. */
  status: DriverStatus;
  active_job_id?: string | null;
  active_job_number?: string | null;
  /** Karyawan pemilik data driver ini di-blacklist (diatur di menu Karyawan). */
  is_blacklist?: boolean;
  blacklist_alasan?: string | null;
  blacklist_at?: string | null;
  blacklist_oleh_nama?: string | null;
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

/**
 * Master vendor (Master Data → Vendor). Sementara strukturnya disamakan
 * dengan customer — akan dirombak sesuai kebutuhan.
 */
export type Vendor = Customer;

export interface JobPhoto {
  id: string;
  job_id: string;
  type: PhotoStage;
  stage: PhotoStage;
  /** null untuk foto lama (sebelum v2) tanpa slot. */
  slot: PhotoSlot | null;
  file_path: string;
  file_url: string;
  uploaded_at: string;
  sharpness_score?: number | null;
  kualitas_rendah: boolean;
  taken_at?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Job seperti dilihat portal driver — bentuknya sama, unit_kode/no_polisi terisi. */
export type DriverJob = Job;

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

/** Jumlah riwayat unit / unit trailer — penentu tombol Hapus atau Nonaktifkan. */
export interface RiwayatAset {
  job: number;
  insiden: number;
  service: number;
  penjualan: number;
  penghapusan: number;
  /** Perintah kerja perbaikan. */
  perbaikan?: number;
  /** True bila semua riwayat kosong → boleh dihapus; selain itu hanya dinonaktifkan. */
  bisa_dihapus: boolean;
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
  /**
   * Customer & PIC lapangan diambil dari proyek job ini. customer_id null =
   * proyek tanpa customer (unit jalan kosongan); customer_nama berisi
   * "Tanpa customer".
   */
  customer_id: string | null;
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
  uang_jalan_awal?: number | null;
  /** Sales job (master sales) — hanya data internal. */
  sales_id?: string | null;
  sales_nama?: string | null;
  sales_no_hp?: string | null;
  /**
   * Waktu sampai lokasi muat / bongkar (pertama kali Loading / Unloading;
   * ganti unit memakai tanggal insiden). Diisi database, tidak pernah diubah.
   */
  muat_at?: string | null;
  bongkar_at?: string | null;
  unit_id: string;
  /** Unit trailer yang ditarik (wajib bila jenis unit-nya punya jenis unit trailer). */
  unit_trailer_id?: string | null;
  unit_trailer_kode?: string | null;
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
  /** Validasi admin (Fase 7). */
  validated_at?: string | null;
  validated_by_nama?: string | null;
  /** Karyawan pembuat job. */
  created_by_nama?: string | null;
  validation_note?: string | null;
  eta_is_estimated?: boolean;
  /** Penawaran asal job ini. Null untuk job yang dibuat langsung tanpa penawaran. */
  quotation_id?: string | null;
  quotation_number?: string | null;
  /** Item penawaran (yang deal) asal job ini. */
  quotation_item_id?: string | null;
  /** Proyek induk job ini — setiap job wajib masuk satu proyek. */
  proyek_id?: string | null;
  proyek_nomor?: string | null;
  /** Ganti unit karena rusak: job ini menggantikan job lama… */
  menggantikan_job_id?: string | null;
  menggantikan_job_number?: string | null;
  /** …atau job ini sudah diganti job pengganti (job lama: tidak ditagih). */
  diganti_oleh_job_id?: string | null;
  diganti_oleh_job_number?: string | null;
  /** Tagihan aktif (tidak batal) yang memuat job ini — nomor & status bayar, hanya untuk admin. */
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_status_bayar?: StatusBayar | null;
  /** Khusus superadmin & finance: status tagihan & sisa nominal. */
  invoice_status_tampil?: InvoiceTampilStatus | null;
  invoice_hari_terlambat?: number | null;
  invoice_sisa?: number | null;
  /** True = info tagihan dikirim backend (admin); operator selalu false. */
  info_tagihan?: boolean;
  photos: JobPhoto[];
  /**
   * Driver sudah mengajukan pencairan uang jalan dan menunggu keputusan admin.
   * Hanya terisi pada payload admin; portal driver & halaman publik selalu false.
   */
  /** Total uang jalan yang sudah ditransfer ke driver. > 0 = tidak bisa dibatalkan. */
  uang_jalan_cair?: number;
  /** Sudah ada pencairan uang jalan — unit, unit trailer & driver terkunci di edit job. */
  ada_pencairan_uang_jalan?: boolean;
  uang_jalan_pending?: boolean;
  uang_jalan_pending_nominal?: number | null;
  uang_jalan_pending_at?: string | null;
  /** Diisi hanya oleh portal driver / halaman publik. */
  unit_kode?: string | null;
  unit_no_polisi?: string | null;
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
  /** Tepat satu terisi: insiden unit atau insiden unit trailer. */
  unit_id?: string | null;
  unit_kode?: string;
  unit_trailer_id?: string | null;
  unit_trailer_kode?: string | null;
  /** Job yang sedang memakai unit saat insiden dicatat (diisi otomatis). */
  job_id?: string | null;
  job_number?: string | null;
  /** Dipakai / dicatat oleh Ganti unit di job — tidak bisa dihapus. */
  dari_ganti_unit?: boolean;
  tipe: IncidentType;
  tanggal: string;
  lokasi?: string | null;
  deskripsi: string;
  biaya_repair?: number | null;
  vendor_repair?: string | null;
  status: IncidentStatus;
  resolved_at?: string | null;
  /** Ditutup (Selesai) di luar alur biasa: aset diafkirkan / terjual, atau diselesaikan tanpa perbaikan. */
  ditutup_karena?: "diafkirkan" | "terjual" | "tanpa_perbaikan" | null;
  status_sebelum_ditutup?: IncidentStatus | null;
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

const LABEL_DITUTUP_KARENA: Record<NonNullable<Incident["ditutup_karena"]>, string> = {
  diafkirkan: "diafkirkan",
  terjual: "terjual",
  tanpa_perbaikan: "tanpa perbaikan"
};

/** Label status insiden, termasuk "Selesai (diafkirkan)" / "Selesai (terjual)" / "Selesai (tanpa perbaikan)". */
export function labelStatusInsiden(inc: Pick<Incident, "status" | "ditutup_karena">): string {
  return inc.status === "resolved" && inc.ditutup_karena
    ? `Selesai (${LABEL_DITUTUP_KARENA[inc.ditutup_karena]})`
    : incidentStatusLabel[inc.status];
}

/** Urutan tahap job v2 (PRD §6.1) — dipakai stepper internal. */
export const jobStatusOrder: Array<{ key: JobStatus; label: string }> = [
  { key: "ditugaskan", label: "Ditugaskan" },
  { key: "diterima", label: "Diterima driver" },
  { key: "loading", label: "Loading" },
  { key: "dalam_perjalanan", label: "Dalam perjalanan" },
  { key: "unloading", label: "Unloading" },
  { key: "serah_terima_pool", label: "Serah terima pool" },
  { key: "menunggu_validasi", label: "Menunggu validasi" },
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

/** Tahap surat. Deal / ditolak adalah keputusan per ITEM (KeputusanItem);
 *  completed = semua item sudah diputuskan; kedaluwarsa dihitung dari tanggal. */
export type QuotationStatus = "draft" | "terkirim" | "completed" | "kedaluwarsa";

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  draft: "Draft",
  terkirim: "Terkirim",
  completed: "Completed",
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
  /** Rute (kode kecamatan) & jenis unit — dasar rekomendasi harga terakhir.
   *  Kosong di item lama (rutenya masih teks bebas). */
  dari_kecamatan_kode?: string | null;
  tujuan_kecamatan_kode?: string | null;
  jenis_unit_id?: string | null;
  /** Harga awal penawaran — tidak pernah ditimpa oleh revisi. */
  harga_satuan: number;
  /** Dihitung database (qty x harga_satuan), tidak pernah dikirim client. */
  subtotal: number;
  keputusan: KeputusanItem;
  /** Harga satuan hasil negosiasi; null = harga awal tetap berlaku. */
  harga_revisi?: number | null;
  /** Harga yang berlaku (revisi bila ada) dan qty × harga itu. */
  harga_final: number;
  subtotal_final: number;
  alasan_ditolak?: string | null;
  diputuskan_at?: string | null;
  /** Karyawan TERAKHIR yang memberi / mengubah keputusan item. */
  diputuskan_oleh?: string | null;
  diputuskan_oleh_nama?: string | null;
  /** Job aktif (tidak dibatalkan) dari item ini. */
  jumlah_job: number;
}

export type KeputusanItem = "menunggu" | "deal" | "ditolak";

/** Kecamatan (kode wilayah Kemendagri), untuk rute item penawaran. */
export interface Kecamatan {
  kode: string;
  nama: string;
  /** Ringkas, mis. "Pekanbaru" / "Jakarta Pusat". */
  kab_kota: string;
  /** Resmi, mis. "Kota Pekanbaru" — membedakan Kota & Kabupaten bernama sama. */
  kab_kota_resmi: string;
  provinsi: string;
}

/** Harga terakhir untuk rute + jenis unit yang sama. */
export interface RekomendasiHarga {
  /** customer = penawaran ke customer yang sama; semua = semua customer. */
  lingkup: "customer" | "semua";
  /** deal = item disetujui (harga revisi bila ada); menunggu = belum diputuskan. */
  kategori: "deal" | "menunggu";
  quotation_id: string;
  quote_number: string;
  customer_nama: string;
  tanggal: string;
  berlaku_sampai?: string | null;
  kedaluwarsa: boolean;
  diputuskan_at?: string | null;
  /** Harga satuan yang berlaku (revisi bila ada). */
  harga: number;
  harga_satuan: number;
  harga_revisi?: number | null;
  nama_alat?: string | null;
  qty: number;
  satuan: string;
}

export const keputusanItemLabel: Record<KeputusanItem, string> = {
  menunggu: "Menunggu",
  deal: "Deal",
  ditolak: "Ditolak"
};

export interface Quotation {
  id: string;
  /** Tersimpan sebagai draft (belum pernah dikirim) — juga saat tampil kedaluwarsa. */
  belum_dikirim?: boolean;
  /** Tanggal surat versi revisi (disimpan saat dicetak); null = belum pernah dicetak. */
  tanggal_revisi?: string | null;
  /** Masa berlaku surat asli — sejak surat revisi dicetak, berlaku_sampai milik surat revisi. */
  berlaku_sampai_asli?: string | null;
  /** Siapa & kapan terakhir mengisi / mengubah Berlaku sampai. */
  berlaku_diatur_oleh?: string | null;
  berlaku_diatur_oleh_nama?: string | null;
  berlaku_diatur_at?: string | null;
  /** Siapa & kapan surat versi revisi dibuat. */
  revisi_dibuat_oleh?: string | null;
  revisi_dibuat_oleh_nama?: string | null;
  revisi_dibuat_at?: string | null;
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
  /** Jumlah subtotal item yang deal (harga final, sebelum PPN). */
  nilai_deal: number;
}

/** Baris untuk halaman daftar — tanpa items, supaya query-nya ringan. */
export type QuotationListRow = Omit<Quotation, "items"> & {
  jumlah_item: number;
  /** Job yang sudah dibuat dari penawaran ini, tidak termasuk yang dibatalkan. */
  jumlah_job: number;
  jumlah_job_selesai: number;
  /** Punya item deal tetapi belum ada satu pun proyek aktif. */
  deal_belum_ada_proyek?: boolean;
  /** Proyek yang terbentuk dari penawaran ini (dari job-job aktifnya). */
  jumlah_proyek?: number;
  /** Item yang disetujui (deal), termasuk yang harganya direvisi. */
  jumlah_item_deal?: number;
  jumlah_item_deal_revisi?: number;
  /** Item belum diputuskan / ditolak dan nilainya (harga awal, sebelum PPN). */
  jumlah_item_menunggu?: number;
  nilai_item_menunggu?: number;
  jumlah_item_ditolak?: number;
  nilai_item_ditolak?: number;
};

/** Ringkasan job yang lahir dari sebuah penawaran. */
export interface QuotationJobRef {
  id: string;
  job_number: string;
  status: JobStatus;
  asal: string;
  tujuan: string;
  etd: string;
  quotation_item_id?: string | null;
  proyek_id?: string | null;
  proyek_nomor?: string | null;
  unit_id?: string | null;
  unit_kode?: string | null;
  proyek_created_at?: string | null;
  proyek_created_by_nama?: string | null;
}

/** Kasbon supir (sisa uang jalan yang tidak dikembalikan saat diganti). */
export interface KasbonDriver {
  id: string;
  jumlah: number;
  asal: "ganti_driver" | "ganti_unit";
  keterangan: string | null;
  job_id: string | null;
  job_number: string | null;
  created_at: string;
  created_by_nama: string | null;
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

/**
 * pencairan = uang ke driver; tambahan = menambah uang jalan job;
 * pengembalian & kasbon = dicatat saat ganti driver / unit. Pengembalian
 * mengurangi cair; kasbon tidak (hanya mencatat utang supir lama).
 */
export type UangJalanJenis = "pencairan" | "tambahan" | "pengembalian" | "kasbon";

export const uangJalanJenisLabel: Record<UangJalanJenis, string> = {
  pencairan: "Dikasih",
  tambahan: "Tambah uang jalan",
  pengembalian: "Dikembalikan supir",
  kasbon: "Kasbon supir"
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
  /** Bukti transfer (bucket privat) — URL bertanda tangan, berlaku sementara. */
  bukti_transfer_path?: string | null;
  bukti_transfer_url?: string | null;
  request_id?: string | null;
  /** Tambahan uang jalan butuh approval; pencairan selalu "disetujui". */
  status_approval?: "menunggu" | "disetujui" | "ditolak";
}

export type UangJalanRequestStatus = "diajukan" | "dicairkan" | "ditolak";

/** Pengajuan uang jalan oleh driver (BR-05). */
export interface UangJalanRequest {
  id: string;
  job_id: string;
  job_number?: string | null;
  driver_id: string;
  driver_nama?: string | null;
  nominal: number;
  catatan?: string | null;
  status: UangJalanRequestStatus;
  alasan_tolak?: string | null;
  uang_jalan_id?: string | null;
  requested_at: string;
  decided_at?: string | null;
}

/** Posisi uang jalan sebuah job, dihitung database. */
export interface UangJalanPosisi {
  /** Uang jalan job (awal + tambahan). */
  uang_jalan: number;
  cair: number;
  sisa: number;
  ada_bukti: boolean;
  pending_request: boolean;
}

/**
 * Ringkasan uang jalan sebuah job. Semua angka diturunkan dari riwayat,
 * tidak ada yang disimpan — jadi tidak bisa berbeda dari kejadiannya.
 */
export interface UangJalanRingkasan {
  /** Uang jalan awal, ditetapkan saat job dibuat. */
  uang_jalan_awal: number;
  /** Total kesepakatan tambahan sesudahnya. */
  tambahan: number;
  /** uang_jalan_awal + tambahan */
  uang_jalan: number;
  /** Total yang sudah benar-benar cair. */
  cair: number;
  /** uang_jalan - cair. Negatif berarti cair melebihi uang jalan job. */
  sisa: number;
  /** Porsi yang sudah cair terhadap uang jalan job, untuk indikator cepat. */
  persen_cair: number;
  /** Tambahan yang masih menunggu approval — belum masuk uang_jalan. */
  tambahan_menunggu?: number;
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

/** Status bayar tagihan — diturunkan dari dibayar vs total. */
export type StatusBayar = "unpaid" | "partial_paid" | "completed";

export const statusBayarLabel: Record<StatusBayar, string> = {
  unpaid: "Unpaid",
  partial_paid: "Partial Paid",
  completed: "Completed"
};

/** Satu transaksi uang jalan job — ditampilkan di form & detail tagihan. */
export interface UangJalanTransaksi {
  jenis: "pencairan" | "tambahan";
  tanggal: string;
  jumlah: number;
  keterangan: string | null;
  /** URL bertanda tangan sementara; null bila tanpa bukti transfer. */
  bukti_url: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  urutan: number;
  /** Job yang ditagihkan baris ini. Null untuk baris di luar job. */
  job_id?: string | null;
  job_number?: string | null;
  /** Proyek induk job baris ini — job ditaruh di bawah baris proyeknya. */
  proyek_id?: string | null;
  proyek_nomor?: string | null;
  deskripsi: string;
  dari?: string | null;
  tujuan?: string | null;
  qty: number;
  satuan: string;
  harga_satuan: number;
  /** Dihitung database (qty x harga_satuan), tidak pernah dikirim client. */
  subtotal: number;
  /** Ringkasan saja — kosong/null untuk baris tanpa job atau job tanpa data ini. */
  uang_jalan_total?: number | null;
  uang_jalan_cair?: number | null;
  surat_jalan_urls?: string[];
  /** Surat jalan per tahap: saat loading & saat unloading. */
  surat_jalan_loading_urls?: string[];
  surat_jalan_unloading_urls?: string[];
  /** Rincian uang jalan: uang jalan awal + tiap pencairan / tambahan (dengan bukti transfer). */
  uang_jalan_awal?: number | null;
  uang_jalan_transaksi?: UangJalanTransaksi[];
}

/**
 * Baris rincian per proyek: teks bebas yang tercetak di invoice + nominal.
 * Job-jobnya ada di `Invoice.items` (proyek_id sama), nominal dibagi rata.
 */
export interface InvoiceProyek {
  id: string;
  invoice_id: string;
  proyek_id: string;
  proyek_nomor?: string | null;
  urutan: number;
  uraian: string;
  nominal: number;
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
  /** Potongan PPh 23 (perusahaan pemberi jasa), default mati, 2%. */
  pph23_aktif: boolean;
  pph23_persen: number;
  subtotal: number;
  ppn_nominal: number;
  /** ROUND(subtotal × pph23_persen / 100) — mengurangi total. */
  pph23_nominal: number;
  /** subtotal + PPN − PPh 23 = yang dibayar customer. */
  total: number;
  /** Jumlah pembayaran masuk. Diisi database dari invoice_payments. */
  dibayar: number;
  /** total - dibayar. Diturunkan, tidak disimpan. */
  sisa: number;

  status: InvoiceStatus;
  /** Status untuk ditampilkan; termasuk `jatuh_tempo` yang diturunkan tanggal. */
  status_tampil: InvoiceTampilStatus;
  /** Unpaid (belum ada pembayaran) / Partial Paid / Completed (lunas). */
  status_bayar: StatusBayar;
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

  /** Hanya terisi di detail (bukan list) — URL bertanda tangan, berlaku sementara. */
  faktur_pajak_uploaded_at?: string | null;
  faktur_pajak_url?: string | null;

  /** Rincian per proyek; kosong untuk tagihan lama (tampil per baris `items`). */
  proyek?: InvoiceProyek[];
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

export type InvoiceListRow = Omit<Invoice, "items" | "payments"> & {
  jumlah_item: number;
  /** Nomor proyek dari job-job di tagihan ini (boleh lebih dari satu). */
  proyek_nomor: string[];
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
/** Laba per proyek: jumlah angka job-job proyek. */
export interface ProyekProfitabilityRow {
  proyek_id: string;
  nomor_proyek: string;
  customer_nama: string;
  /** Proyek tanpa customer (unit jalan kosongan) → cost perusahaan, tidak ditagih. */
  kosongan: boolean;
  unit_kode: string;
  /** ETD job pertama — dasar rentang tanggal laporan. */
  etd_awal: string;
  jumlah_job: number;
  /** Semua job selesai (job yang unitnya diganti dianggap selesai). */
  semua_selesai: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  /** Nilai tagihan proyek, di luar PPN. */
  pendapatan: number;
  /** Uang jalan yang benar-benar terpakai (pencairan − pengembalian; kasbon tidak mengurangi). */
  uang_jalan: number;
  biaya_insiden: number;
  laba: number;
}

/**
 * Laba tahunan per bulan. Dasarnya tagihan: omset dan seluruh biaya proyek
 * yang ditagih jatuh di bulan tanggal tagihan. Semua angka di luar PPN.
 */
export interface LabaBulanRow {
  /** 1–12. */
  bulan: number;
  jumlah_tagihan: number;
  jumlah_proyek: number;
  omset: number;
  /** Porsi DPP dari pembayaran yang sudah masuk. */
  dibayar: number;
  /** Total: proyek ditagih + proyek kosongan. */
  uang_jalan: number;
  /** Biaya Lain job (total ditagih + kosongan). Biaya repair tidak dihitung. */
  biaya_lainnya: number;
  /** Proyek kosongan yang bongkar di bulan ini (tidak ditagih, cost perusahaan). */
  jumlah_kosongan: number;
  uang_jalan_kosongan: number;
  biaya_lainnya_kosongan: number;
  profit: number;
  /** Persen profit terhadap omset; null bila omset nol. */
  margin: number | null;
}

/** Proyek yang semua job-nya selesai tapi belum ada tagihannya. */
export interface ProyekBelumDitagihRow {
  proyek_id: string;
  nomor_proyek: string;
  customer_nama: string;
  unit_kode: string;
  etd_awal: string;
  jumlah_job: number;
  uang_jalan: number;
  biaya_lainnya: number;
}

export interface LabaTahunan {
  tahun: number;
  bulan: LabaBulanRow[];
  belum_ditagih: {
    jumlah: number;
    uang_jalan: number;
    biaya_lainnya: number;
    daftar: ProyekBelumDitagihRow[];
  };
}

/** Master jenis biaya (Master Data → Jenis Biaya). */
export interface JenisBiaya {
  id: string;
  nama: string;
}

/** Biaya lain per job — murni biaya perusahaan, tidak masuk tagihan. */
export interface BiayaLain {
  id: string;
  job_id: string;
  jenis_biaya_id: string;
  jenis_biaya_nama: string;
  nominal: number;
  catatan: string | null;
  created_by_nama: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pengguna & sesi
// ---------------------------------------------------------------------------

export type UserRole = "superadmin" | "operator" | "finance" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  nama: string;
  initials: string;
  /** Role yang sedang dipakai di sesi login ini (menentukan hak akses). */
  role: UserRole;
  /** Semua role yang dimiliki akun; lebih dari satu = bisa ganti role. */
  roles: UserRole[];
  /**
   * superadmin: selalu null (akses semua).
   * operator: daftar jenis_unit_id yang boleh diakses; null/kosong = belum
   * diberi scope oleh superadmin.
   */
  allowed_jenis_unit_ids: string[] | null;
}

export interface UserRow {
  id: string;
  email: string;
  nama: string;
  /** Role tertinggi (untuk tampilan ringkas). */
  role: UserRole;
  /** Semua role yang dimiliki akun (satu email bisa beberapa role). */
  roles: UserRole[];
  is_active: boolean;
  allowed_jenis_unit_ids: string[] | null;
  /** Relasi ke hr.karyawan — hanya karyawan yang boleh jadi pengguna. */
  karyawan_id: string | null;
  /** Status karyawan pemilik akun. false = akun tidak bisa diaktifkan. */
  karyawan_aktif?: boolean;
  created_at: string;
}

/** Karyawan yang belum punya akun pengguna (pilihan form tambah pengguna). */
export interface KaryawanOption {
  id: string;
  nama: string;
  tanggal_lahir: string | null;
  /**
   * Role yang sudah dimiliki karyawan ini (satu baris per akun + role).
   * Karyawan + role yang sama tidak boleh ada di dua akun.
   */
  akun?: { user_id: string; role: UserRole }[];
}

export interface DriverSession {
  driver_id: string;
  nama: string;
  no_hp: string;
}

/** Bentuk hasil aksi mutasi — dipertahankan dari versi sebelumnya supaya
 *  komponen form tidak perlu tahu detail HTTP. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Bentuk respons API lain-lain
// ---------------------------------------------------------------------------

export interface DriverAssignment {
  unit_id: string;
  kode_unit: string;
}

export interface UtilizationRow {
  unit_id: string;
  kode_unit: string;
  jenis: string;
  hari_bertugas: number;
  hari_standby: number;
  hari_perbaikan: number;
  persentase_utilisasi: number;
}

export interface JobBelumDitagihRow {
  id: string;
  job_number: string;
  asal: string;
  tujuan: string;
  alat_diangkut: string;
  etd: string;
  completed_at: string | null;
  /** Ringkasan saja — untuk konteks saat memilih job, bukan rincian transaksi. */
  uang_jalan_total: number;
  uang_jalan_cair: number;
  surat_jalan_urls: string[];
  /** Surat jalan per tahap: saat loading & saat unloading. */
  surat_jalan_loading_urls: string[];
  surat_jalan_unloading_urls: string[];
  uang_jalan_awal: number;
  uang_jalan_transaksi: UangJalanTransaksi[];
  /** Proyek induk job. */
  proyek_id?: string | null;
  proyek_nomor?: string | null;
  /**
   * Tagihan aktif yang sudah memuat job lain dari proyek ini. Satu proyek
   * hanya boleh masuk satu tagihan, jadi job ini hanya bisa ditambahkan ke
   * tagihan tersebut.
   */
  proyek_invoice_id?: string | null;
  proyek_invoice_number?: string | null;
  /** Jumlah job proyek ini yang tidak dibatalkan. */
  proyek_jumlah_job?: number;
}

/** Satu baris di Tab Proyek. */
export interface ProyekRingkas {
  id: string;
  /** Nomor otomatis, mis. 001/PRJ/MAS/X/2026 (urut di-reset tiap bulan). */
  nomor_proyek: string;
  /** Kosong = proyek tanpa customer (unit jalan kosongan). */
  customer_id: string | null;
  customer_nama: string | null;
  /** PIC lapangan & No HP-nya — milik proyek (dulu per job). */
  pic_nama: string | null;
  pic_no_hp: string | null;
  /** Author: pengguna yang membuat proyek. */
  created_by_nama: string | null;
  created_at: string;
  /** Unit proyek (bisa lebih dari satu setelah ganti unit karena rusak). */
  unit_kode: string | null;
  /** Nomor penawaran asal (bila proyek dari penawaran). */
  quote_number: string | null;
  jumlah_job: number;
  jumlah_job_selesai: number;
  jumlah_job_batal: number;
  /** Tagihan aktif yang memuat proyek ini (paling banyak satu). */
  invoice_id: string | null;
  invoice_number: string | null;
}

/** Tagihan yang pernah dibuat untuk proyek, termasuk yang dibatalkan. */
export interface ProyekTagihan {
  id: string;
  invoice_number: string;
  tanggal: string;
  created_at: string;
  status_tampil: InvoiceTampilStatus;
  status_bayar: StatusBayar;
  alasan_batal: string | null;
  /** Nominal hanya untuk superadmin & finance; admin menerima null. */
  total: number | null;
  dibayar: number | null;
  sisa: number | null;
}

/** Uang jalan & biaya lain satu job — angka sama dengan kartu di detail job. */
export interface ProyekBiayaJob {
  /** Uang jalan job = awal + tambahan disetujui. */
  uang_jalan: number;
  /** Sudah diberikan ke driver (pencairan − pengembalian). */
  cair: number;
  sisa: number;
  biaya_lain: number;
}

export interface ProyekDetail extends ProyekRingkas {
  jobs: Job[];
  /** Per job_id. */
  biaya_job?: Record<string, ProyekBiayaJob>;
  /** Urut dibuat paling awal di atas; kosong untuk operator. */
  tagihan: ProyekTagihan[];
}

export interface UangJalanJobRow {
  job_id: string;
  job_number: string;
  status: string;
  asal: string;
  tujuan: string;
  etd: string;
  unit_kode: string | null;
  driver_nama: string | null;
  customer_nama: string | null;
  ringkasan: UangJalanRingkasan;
  pencairan_terakhir: string | null;
  /** Pengajuan driver yang belum dicairkan. */
  pengajuan_menunggu: number;
  /** Tambahan uang jalan yang masih menunggu approval. */
  tambahan_menunggu_approval?: number;
}

export interface LocationEntry {
  lat: number;
  lng: number;
  address: string | null;
  fetched_at: string;
}

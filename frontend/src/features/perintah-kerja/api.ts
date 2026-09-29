import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ServerPage } from "@/lib/server-page";
import type { AsuransiPic, PolisAsuransi } from "@/features/asuransi/api";
import type { ActionResult } from "@/types";

export type JenisAset = "unit" | "unit_trailer";
export type SumberWo = "servis_berkala" | "insiden" | "keluhan_driver" | "inspeksi" | "lainnya";
export type JenisWo = "rutin" | "oli" | "ban" | "mesin" | "kelistrikan" | "rem" | "body" | "lainnya";
export type Prioritas = "rendah" | "normal" | "tinggi";
export type Pelaksana = "internal" | "bengkel" | "asuransi";
export type StatusWo =
  | "draft"
  | "dijadwalkan"
  | "dikerjakan"
  | "menunggu_sparepart"
  | "menunggu_asuransi"
  | "selesai"
  | "dibatalkan";
export type StatusKlaim = "diajukan" | "survei" | "disetujui" | "ditolak" | "dibayar";
export type JenisFoto = "sebelum" | "sesudah" | "dokumen" | "klaim";

export const SUMBER_WO: { value: SumberWo; label: string }[] = [
  { value: "servis_berkala", label: "Servis berkala" },
  { value: "insiden", label: "Dari insiden" },
  { value: "keluhan_driver", label: "Keluhan driver" },
  { value: "inspeksi", label: "Inspeksi" },
  { value: "lainnya", label: "Lainnya" }
];

export const JENIS_WO: { value: JenisWo; label: string }[] = [
  { value: "rutin", label: "Servis rutin" },
  { value: "oli", label: "Ganti oli" },
  { value: "ban", label: "Ban" },
  { value: "mesin", label: "Mesin" },
  { value: "kelistrikan", label: "Kelistrikan" },
  { value: "rem", label: "Rem" },
  { value: "body", label: "Body" },
  { value: "lainnya", label: "Lainnya" }
];

export const PRIORITAS: { value: Prioritas; label: string }[] = [
  { value: "rendah", label: "Rendah" },
  { value: "normal", label: "Normal" },
  { value: "tinggi", label: "Tinggi" }
];

export const PELAKSANA: { value: Pelaksana; label: string; hint: string }[] = [
  { value: "internal", label: "Mekanik internal", hint: "Dikerjakan mekanik sendiri" },
  { value: "bengkel", label: "Bengkel luar", hint: "Dikerjakan bengkel / vendor luar" },
  { value: "asuransi", label: "Asuransi", hint: "Diklaim ke asuransi, dikerjakan bengkel rekanan" }
];

export const STATUS_WO: Record<StatusWo, { label: string; kelas: string }> = {
  draft: { label: "Draft", kelas: "" },
  dijadwalkan: { label: "Dijadwalkan", kelas: "badge-pickup" },
  dikerjakan: { label: "Dikerjakan", kelas: "badge-perbaikan" },
  menunggu_sparepart: { label: "Menunggu sparepart", kelas: "badge-loading" },
  menunggu_asuransi: { label: "Menunggu asuransi", kelas: "badge-loading" },
  selesai: { label: "Selesai", kelas: "badge-status-standby" },
  dibatalkan: { label: "Dibatalkan", kelas: "badge-cancelled" }
};

export const STATUS_KLAIM: Record<StatusKlaim, string> = {
  diajukan: "Diajukan",
  survei: "Survei",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibayar: "Dibayar"
};

export const JENIS_FOTO: Record<JenisFoto, string> = {
  sebelum: "Foto sebelum",
  sesudah: "Foto sesudah",
  dokumen: "Nota / dokumen",
  klaim: "Dokumen klaim"
};

/** Status yang membuat aset berstatus Perbaikan. */
export const STATUS_AKTIF: StatusWo[] = ["dikerjakan", "menunggu_sparepart", "menunggu_asuransi"];
export const STATUS_FINAL: StatusWo[] = ["selesai", "dibatalkan"];

export const labelDari = <T extends string>(daftar: { value: T; label: string }[], v: T) =>
  daftar.find((d) => d.value === v)?.label ?? v;

export interface Tanggungan {
  total: number;
  asuransi: number;
  perusahaan: number;
  own_risk: number;
  estimasi: boolean;
}

export interface PerintahKerjaRingkas {
  id: string;
  nomor: string;
  tanggal: string;
  jenis_aset: JenisAset;
  aset_id: string;
  kode_aset: string;
  jenis: JenisWo;
  sumber: SumberWo;
  prioritas: Prioritas;
  keluhan: string | null;
  pelaksana: Pelaksana;
  pelaksana_nama: string | null;
  status_wo: StatusWo;
  jadwal_mulai: string | null;
  estimasi_selesai: string | null;
  tanggal_selesai: string | null;
  odometer_km: number | null;
  total_biaya: number;
  tanggungan: Tanggungan;
  incident_id: string | null;
  status_klaim: StatusKlaim | null;
}

export interface MekanikBertugas {
  id: string;
  mekanik_id: string;
  nama: string;
  is_penanggung_jawab: boolean;
}

export interface JasaItem {
  id: string;
  uraian: string;
  mekanik_id: string | null;
  mekanik_nama: string | null;
  jam_kerja: number | null;
  biaya: number;
}

export interface SparepartItem {
  id: string;
  kode: string | null;
  nama: string;
  qty: number;
  satuan: string | null;
  harga_satuan: number;
  subtotal: number;
  keterangan: string | null;
}

export interface BiayaLainItem {
  id: string;
  uraian: string;
  biaya: number;
}

export interface FotoWo {
  id: string;
  jenis: JenisFoto;
  nama_file: string | null;
  content_type: string | null;
  url: string | null;
  created_at: string;
}

export interface Klaim {
  id: string;
  nomor_klaim: string | null;
  tanggal_pengajuan: string | null;
  status_klaim: StatusKlaim;
  nilai_diajukan: number | null;
  nilai_disetujui: number | null;
  own_risk: number | null;
  catatan: string | null;
  pic: AsuransiPic | null;
}

export interface PerintahKerja extends PerintahKerjaRingkas {
  diagnosa: string | null;
  catatan: string | null;
  alasan_batal: string | null;
  no_nota: string | null;
  bengkel_id: string | null;
  polis: PolisAsuransi | null;
  bengkel_rekanan_id: string | null;
  bengkel_rekanan_nama: string | null;
  mekanik: MekanikBertugas[];
  jasa: JasaItem[];
  sparepart: SparepartItem[];
  biaya_lain: BiayaLainItem[];
  foto: FotoWo[];
  klaim: Klaim | null;
  total_jasa: number;
  total_sparepart: number;
  total_lain: number;
  created_at: string;
}

export interface KlaimInput {
  pic_id: string | null;
  nomor_klaim: string | null;
  tanggal_pengajuan: string | null;
  status_klaim: StatusKlaim;
  nilai_diajukan: number | null;
  nilai_disetujui: number | null;
  own_risk: number | null;
  catatan: string | null;
}

export interface PerintahKerjaInput {
  unit_id: string | null;
  unit_trailer_id: string | null;
  tanggal: string;
  incident_id: string | null;
  sumber: SumberWo;
  jenis: JenisWo;
  prioritas: Prioritas;
  keluhan: string | null;
  diagnosa: string | null;
  catatan: string | null;
  pelaksana: Pelaksana;
  bengkel_id: string | null;
  polis_id: string | null;
  bengkel_rekanan_id: string | null;
  no_nota: string | null;
  jadwal_mulai: string | null;
  estimasi_selesai: string | null;
  odometer_km: number | null;
  status_wo: "draft" | "dijadwalkan" | "dikerjakan";
  mekanik: { mekanik_id: string; is_penanggung_jawab: boolean }[];
  jasa: { id?: string | null; uraian: string; mekanik_id: string | null; jam_kerja: number | null; biaya: number }[];
  sparepart: {
    id?: string | null;
    kode: string | null;
    nama: string;
    qty: number;
    satuan: string | null;
    harga_satuan: number;
    keterangan: string | null;
  }[];
  biaya_lain: { id?: string | null; uraian: string; biaya: number }[];
  klaim: KlaimInput | null;
}

export interface UbahStatusInput {
  status_wo: StatusWo;
  alasan_batal?: string | null;
  tanggal_selesai?: string | null;
  odometer_km?: number | null;
}

export interface PerintahKerjaFilter {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  pelaksana?: Pelaksana | "";
  jenis?: JenisWo | "";
  dari?: string;
  sampai?: string;
  unit_id?: string;
  unit_trailer_id?: string;
  incident_id?: string;
  asuransi_id?: string;
}

export const listPerintahKerjaPage = (f: PerintahKerjaFilter) =>
  api.get<ServerPage<PerintahKerjaRingkas>>("/perintah-kerja/page", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q?.trim() || undefined,
    status: f.status || undefined,
    pelaksana: f.pelaksana || undefined,
    jenis: f.jenis || undefined,
    dari: f.dari || undefined,
    sampai: f.sampai || undefined,
    unit_id: f.unit_id,
    unit_trailer_id: f.unit_trailer_id,
    incident_id: f.incident_id,
    asuransi_id: f.asuransi_id
  });

export const getPerintahKerja = (id: string) => api.get<PerintahKerja>(`/perintah-kerja/${id}`);

export const createPerintahKerja = (input: PerintahKerjaInput): Promise<ActionResult<PerintahKerja>> =>
  mutate(api.post<PerintahKerja>("/perintah-kerja", input));
export const updatePerintahKerja = (id: string, input: PerintahKerjaInput): Promise<ActionResult<unknown>> =>
  mutate(api.patch(`/perintah-kerja/${id}`, input));
export const ubahStatusPerintahKerja = (id: string, input: UbahStatusInput): Promise<ActionResult<unknown>> =>
  mutate(api.post(`/perintah-kerja/${id}/status`, input));
export const deletePerintahKerja = (id: string): Promise<ActionResult<unknown>> =>
  mutate(api.delete(`/perintah-kerja/${id}`));

export function uploadFotoPerintahKerja(id: string, jenis: JenisFoto, file: File): Promise<ActionResult<unknown>> {
  const form = new FormData();
  form.append("jenis", jenis);
  form.append("file", file);
  return mutate(api.upload(`/perintah-kerja/${id}/foto`, form));
}
export const deleteFotoPerintahKerja = (id: string, fotoId: string): Promise<ActionResult<unknown>> =>
  mutate(api.delete(`/perintah-kerja/${id}/foto/${fotoId}`));

export const usePerintahKerjaPage = (f: PerintahKerjaFilter, enabled = true) =>
  useQuery({
    queryKey: ["perintah-kerja", "page", f],
    queryFn: () => listPerintahKerjaPage(f),
    placeholderData: keepPreviousData,
    enabled
  });

export const usePerintahKerja = (id: string | undefined) =>
  useQuery({ queryKey: ["perintah-kerja", "detail", id], queryFn: () => getPerintahKerja(id!), enabled: !!id });

// ── Laporan ─────────────────────────────────────────────────────────────────

export interface BiayaPerawatanRow {
  jenis_aset: JenisAset;
  aset_id: string;
  kode_aset: string;
  jumlah_wo: number;
  total_jasa: number;
  total_sparepart: number;
  total_lain: number;
  total_biaya: number;
  ditanggung_asuransi: number;
  ditanggung_perusahaan: number;
  hari_perbaikan: number;
}

export interface KlaimAsuransiRow {
  asuransi_id: string;
  asuransi_nama: string;
  jumlah_klaim: number;
  diajukan: number;
  disetujui: number;
  ditolak: number;
  dibayar: number;
  nilai_diajukan: number;
  nilai_disetujui: number;
}

export const useBiayaPerawatan = (start: string, end: string) =>
  useQuery({
    queryKey: ["reports", "biaya-perawatan", start, end],
    queryFn: () => api.get<BiayaPerawatanRow[]>("/reports/biaya-perawatan", { start, end })
  });

export const useKlaimAsuransi = (start: string, end: string) =>
  useQuery({
    queryKey: ["reports", "klaim-asuransi", start, end],
    queryFn: () => api.get<KlaimAsuransiRow[]>("/reports/klaim-asuransi", { start, end })
  });

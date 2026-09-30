import { api, formDenganDokumen } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ServerPage } from "@/lib/server-page";
import type { ActionResult } from "@/types";

export type Sapaan = "Bapak" | "Ibu";
export type JenisPertanggungan = "all_risk" | "tlo" | "lainnya";

export const JENIS_PERTANGGUNGAN: { value: JenisPertanggungan; label: string }[] = [
  { value: "all_risk", label: "All Risk (Comprehensive)" },
  { value: "tlo", label: "TLO (Total Loss Only)" },
  { value: "lainnya", label: "Lainnya" }
];

export const labelPertanggungan = (v: JenisPertanggungan) =>
  JENIS_PERTANGGUNGAN.find((j) => j.value === v)?.label ?? v;

export interface AsuransiPic {
  id: string;
  sapaan: Sapaan | null;
  nama: string;
  jabatan: string | null;
  no_hp: string;
  email: string | null;
  is_utama: boolean;
}

export interface BengkelRekanan {
  id: string;
  nama: string;
  alamat: string | null;
  kontak: string | null;
}

export interface Asuransi {
  id: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  catatan: string | null;
  is_active: boolean;
  pic: AsuransiPic[];
  bengkel_rekanan: BengkelRekanan[];
  pic_utama: AsuransiPic | null;
  /** Jumlah aset yang polisnya berlaku hari ini. */
  jumlah_aset_aktif: number;
}

export interface AsuransiPicInput {
  id?: string | null;
  sapaan: Sapaan | null;
  nama: string;
  jabatan: string | null;
  no_hp: string;
  email: string | null;
  is_utama: boolean;
}

export interface BengkelRekananInput {
  id?: string | null;
  nama: string;
  alamat: string | null;
  kontak: string | null;
}

export interface AsuransiInput {
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  catatan: string | null;
  pic: AsuransiPicInput[];
  bengkel_rekanan: BengkelRekananInput[];
}

export interface AsuransiFilter {
  page: number;
  pageSize: number;
  q: string;
  aktif: "aktif" | "nonaktif" | "";
}

export const listAsuransiPage = (f: AsuransiFilter) =>
  api.get<ServerPage<Asuransi>>("/asuransi/page", {
    page: f.page,
    page_size: f.pageSize,
    q: f.q.trim() || undefined,
    aktif: f.aktif || undefined
  });

export const asuransiCounts = (q: string) =>
  api.get<{ active: number; inactive: number; all: number }>("/asuransi/counts", { q: q.trim() || undefined });

export const listAsuransi = (includeInactive = false) =>
  api.get<Asuransi[]>("/asuransi", { include_inactive: includeInactive });

export const getAsuransi = (id: string) => api.get<Asuransi>(`/asuransi/${id}`);
export const listPolisMilikAsuransi = (id: string) => api.get<PolisAsuransi[]>(`/asuransi/${id}/polis`);

export const createAsuransi = (input: AsuransiInput): Promise<ActionResult<Asuransi>> =>
  mutate(api.post<Asuransi>("/asuransi", input));
export const updateAsuransi = (id: string, input: AsuransiInput): Promise<ActionResult<unknown>> =>
  mutate(api.patch(`/asuransi/${id}`, input));
export const setAsuransiAktif = (id: string, aktif: boolean): Promise<ActionResult<unknown>> =>
  mutate(api.post(`/asuransi/${id}/${aktif ? "active" : "deactivate"}`));
export const deleteAsuransi = (id: string): Promise<ActionResult<unknown>> => mutate(api.delete(`/asuransi/${id}`));

// ── Polis ───────────────────────────────────────────────────────────────────

export type KeadaanPolis = "berlaku" | "akan_datang" | "berakhir";

export interface PolisAsuransi {
  id: string;
  asuransi_id: string;
  asuransi_nama: string | null;
  unit_id: string | null;
  unit_trailer_id: string | null;
  kode_aset: string | null;
  nomor_polis: string;
  jenis_pertanggungan: JenisPertanggungan;
  mulai: string;
  berakhir: string;
  nilai_pertanggungan: number | null;
  own_risk: number | null;
  premi: number | null;
  catatan: string | null;
  polis_uploaded_at: string | null;
  polis_url: string | null;
  keadaan: KeadaanPolis;
  sisa_hari: number | null;
  pic_utama: AsuransiPic | null;
}

export interface PolisInput {
  asuransi_id: string;
  nomor_polis: string;
  jenis_pertanggungan: JenisPertanggungan;
  mulai: string;
  berakhir: string;
  nilai_pertanggungan: number | null;
  own_risk: number | null;
  premi: number | null;
  catatan: string | null;
  hapus_dokumen_polis?: boolean;
}

export type AsetPolis = { unit_id: string } | { unit_trailer_id: string };

export const listPolisAset = (aset: AsetPolis) => api.get<PolisAsuransi[]>("/polis-asuransi", aset);

export const polisBerlaku = (aset: AsetPolis, tanggal: string) =>
  api.get<PolisAsuransi | null>("/polis-asuransi/berlaku", { ...aset, tanggal });

/** Polis baru / perpanjangan dari halaman detail aset. */
export function createPolis(
  aset: AsetPolis,
  input: PolisInput,
  dokumen?: File | null
): Promise<ActionResult<PolisAsuransi>> {
  return mutate(
    api.upload<PolisAsuransi>("/polis-asuransi", formDenganDokumen({ ...aset, ...input }, { dokumen_polis: dokumen }))
  );
}

export function updatePolis(id: string, input: PolisInput, dokumen?: File | null): Promise<ActionResult<unknown>> {
  return mutate(api.patchForm(`/polis-asuransi/${id}`, formDenganDokumen(input, { dokumen_polis: dokumen })));
}

export const deletePolis = (id: string): Promise<ActionResult<unknown>> => mutate(api.delete(`/polis-asuransi/${id}`));

export const KEADAAN_POLIS: Record<KeadaanPolis, { label: string; kelas: string }> = {
  berlaku: { label: "Berlaku", kelas: "badge-status-standby" },
  akan_datang: { label: "Belum mulai", kelas: "badge-pickup" },
  berakhir: { label: "Berakhir", kelas: "badge-cancelled" }
};

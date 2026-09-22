import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Quotation,
  QuotationItem,
  QuotationJobRef,
  QuotationListRow,
  QuotationStatus
} from "@/lib/types";

const QUOTATION_SELECT = `
  id, quote_number, seq_no, seq_tahun,
  customer_id, customer_nama, customer_kota, pic_sapaan, pic_nama,
  kota_terbit, tanggal, berlaku_sampai, perihal, objek, lampiran,
  ppn_aktif, ppn_persen, subtotal, ppn_nominal, total,
  status, ttd_nama, ttd_jabatan, catatan, alasan_ditolak,
  sent_at, decided_at, created_at, updated_at,
  created_by_profile:profiles!quotations_created_by_fkey(nama)
`;

const ITEM_SELECT = `
  id, quotation_id, urutan, dari, tujuan, qty, satuan,
  nama_alat, harga_satuan, subtotal
`;

interface QuotationRow {
  id: string;
  quote_number: string;
  seq_no: number;
  seq_tahun: number;
  customer_id: string;
  customer_nama: string;
  customer_kota: string | null;
  pic_sapaan: string | null;
  pic_nama: string | null;
  kota_terbit: string;
  tanggal: string;
  berlaku_sampai: string | null;
  perihal: string;
  objek: string | null;
  lampiran: string | null;
  ppn_aktif: boolean;
  ppn_persen: number | string;
  subtotal: number | string;
  ppn_nominal: number | string;
  total: number | string;
  status: QuotationStatus;
  ttd_nama: string | null;
  ttd_jabatan: string | null;
  catatan: string | null;
  alasan_ditolak: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  // Supabase mengetikkan hasil embed sebagai array walaupun relasinya to-one,
  // jadi kedua bentuk ditampung lalu diratakan di namaPembuat().
  created_by_profile: { nama: string } | { nama: string }[] | null;
}

function namaPembuat(v: QuotationRow["created_by_profile"]): string | null {
  if (!v) return null;
  const row = Array.isArray(v) ? v[0] : v;
  return row?.nama ?? null;
}

interface ItemRow {
  id: string;
  quotation_id: string;
  urutan: number;
  dari: string;
  tujuan: string;
  qty: number;
  satuan: string;
  nama_alat: string | null;
  harga_satuan: number | string;
  subtotal: number | string;
}

// Supabase mengembalikan BIGINT/NUMERIC sebagai string ketika nilainya melewati
// rentang aman JS number. Nominal rupiah di sini jauh di bawah batas itu, tapi
// tetap dinormalkan supaya UI tidak pernah menerima string untuk kolom uang.
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tanggal hari ini menurut waktu Indonesia Barat, format YYYY-MM-DD.
 *
 * Server berjalan dengan zona UTC, sedangkan "hari ini" bagi admin adalah hari
 * di Pekanbaru. Tanpa penyesuaian ini, penawaran yang berlaku sampai hari ini
 * akan terbaca kedaluwarsa sejak pukul 07:00 WIB.
 */
function hariIniWIB(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

/**
 * Status yang ditampilkan ke pengguna.
 *
 * Kedaluwarsa tidak disimpan di database melainkan diturunkan dari tanggal:
 * penawaran yang sudah dikirim dan lewat masa berlakunya otomatis terbaca
 * kedaluwarsa. Cara ini dipilih supaya tidak perlu cron — status berubah tepat
 * pada waktunya tanpa ada proses yang harus berjalan di latar belakang, dan
 * tidak ada risiko status ketinggalan karena cron gagal jalan.
 *
 * Yang tersimpan tetap `terkirim`, jadi begitu masa berlakunya diperpanjang
 * lewat form, penawaran langsung kembali aktif tanpa perlu diubah statusnya.
 */
function deriveStatus(
  stored: QuotationStatus,
  berlakuSampai: string | null
): QuotationStatus {
  if (stored !== "terkirim" || !berlakuSampai) return stored;
  return berlakuSampai.slice(0, 10) < hariIniWIB() ? "kedaluwarsa" : stored;
}

function mapItem(r: ItemRow): QuotationItem {
  return {
    id: r.id,
    quotation_id: r.quotation_id,
    urutan: r.urutan,
    dari: r.dari,
    tujuan: r.tujuan,
    qty: r.qty,
    satuan: r.satuan,
    nama_alat: r.nama_alat,
    harga_satuan: num(r.harga_satuan),
    subtotal: num(r.subtotal)
  };
}

function mapQuotation(r: QuotationRow, items: QuotationItem[]): Quotation {
  return {
    id: r.id,
    quote_number: r.quote_number,
    seq_no: r.seq_no,
    seq_tahun: r.seq_tahun,
    customer_id: r.customer_id,
    customer_nama: r.customer_nama,
    customer_kota: r.customer_kota,
    pic_sapaan: (r.pic_sapaan as "Bapak" | "Ibu" | null) ?? null,
    pic_nama: r.pic_nama,
    kota_terbit: r.kota_terbit,
    tanggal: r.tanggal,
    berlaku_sampai: r.berlaku_sampai,
    perihal: r.perihal,
    objek: r.objek,
    lampiran: r.lampiran,
    ppn_aktif: r.ppn_aktif,
    ppn_persen: num(r.ppn_persen),
    subtotal: num(r.subtotal),
    ppn_nominal: num(r.ppn_nominal),
    total: num(r.total),
    status: deriveStatus(r.status, r.berlaku_sampai),
    ttd_nama: r.ttd_nama,
    ttd_jabatan: r.ttd_jabatan,
    catatan: r.catatan,
    alasan_ditolak: r.alasan_ditolak,
    sent_at: r.sent_at,
    decided_at: r.decided_at,
    created_by_nama: namaPembuat(r.created_by_profile),
    created_at: r.created_at,
    updated_at: r.updated_at,
    items
  };
}

export async function listQuotations(opts?: {
  status?: QuotationStatus;
  customerId?: string;
  limit?: number;
}): Promise<QuotationListRow[]> {
  const supabase = await createClient();
  // jobs ikut di-embed untuk kolom "Pelaksanaan" di daftar. Untuk operator,
  // RLS jobs memfilter per jenis unit — jadi hitungannya hanya mencakup job
  // yang memang boleh ia lihat. Owner melihat angka penuh.
  let q = supabase
    .from("quotations")
    .select(`${QUOTATION_SELECT}, quotation_items(id), jobs(id, status)`)
    .order("seq_tahun", { ascending: false })
    .order("seq_no", { ascending: false });

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<
    QuotationRow & {
      quotation_items: Array<{ id: string }> | null;
      jobs: Array<{ id: string; status: string }> | null;
    }
  >).map((r) => {
    const { items: _ignored, ...rest } = mapQuotation(r, []);
    // Job yang dibatalkan tidak dihitung — kalau ikut, penawaran yang job-nya
    // batal akan terlihat seolah sudah dijalankan padahal belum.
    const jobs = (r.jobs ?? []).filter((j) => j.status !== "cancelled");
    return {
      ...rest,
      jumlah_item: r.quotation_items?.length ?? 0,
      jumlah_job: jobs.length,
      jumlah_job_selesai: jobs.filter((j) => j.status === "selesai").length
    } as QuotationListRow;
  });
}

export async function getQuotation(id: string): Promise<Quotation | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotations")
    .select(QUOTATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: itemRows, error: itemErr } = await supabase
    .from("quotation_items")
    .select(ITEM_SELECT)
    .eq("quotation_id", id)
    .order("urutan");
  if (itemErr) throw new Error(itemErr.message);

  return mapQuotation(
    data as unknown as QuotationRow,
    ((itemRows ?? []) as ItemRow[]).map(mapItem)
  );
}

/**
 * Nomor yang akan dipakai penawaran berikutnya — untuk ditampilkan sebagai
 * pratinjau di form.
 *
 * Sengaja TIDAK memanggil next_quotation_number(): fungsi itu menaikkan
 * counter, jadi kalau dipakai di sini setiap kali form dibuka nomor akan
 * terbakar walau penawarannya batal disimpan. Di sini cukup dibaca dari
 * penawaran terakhir, dan nomor final tetap ditetapkan database saat simpan.
 */
export async function peekNextQuotationNumber(): Promise<string> {
  const supabase = await createClient();
  const tahun = new Date().getFullYear();
  const { data } = await supabase
    .from("quotations")
    .select("seq_no")
    .eq("seq_tahun", tahun)
    .order("seq_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const romawi = [
    "I", "II", "III", "IV", "V", "VI",
    "VII", "VIII", "IX", "X", "XI", "XII"
  ];
  const next = ((data as { seq_no: number } | null)?.seq_no ?? 0) + 1;
  const bulan = romawi[new Date().getMonth()];
  return `${String(next).padStart(4, "0")}/SK/MAS/${bulan}/${tahun}`;
}

/**
 * Job yang lahir dari penawaran ini. Bisa lebih dari satu — penawaran dengan
 * beberapa rute perlu satu job per rute.
 */
export async function listJobsForQuotation(
  quotationId: string
): Promise<QuotationJobRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, status, asal, tujuan, etd")
    .eq("quotation_id", quotationId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as QuotationJobRef[];
}

// Penghitungan per status sengaja tidak dibuatkan query terpisah: status
// kedaluwarsa diturunkan saat baca, sehingga menghitungnya lewat
// SELECT status akan berbeda dari yang tampil di layar. Halaman daftar
// menghitungnya sendiri dari baris yang sudah dipetakan.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SumberDana, UangJalan, UangJalanRingkasan } from "@/lib/types";

const UANG_JALAN_SELECT = `
  id, job_id, jenis, tanggal, jumlah, sumber_dana_id, keperluan, catatan, created_at,
  sumber:sumber_dana(nama),
  creator:profiles(nama)
`;

interface UangJalanRow {
  id: string;
  job_id: string;
  jenis: UangJalan["jenis"];
  tanggal: string;
  jumlah: number | string;
  sumber_dana_id: string | null;
  keperluan: string | null;
  catatan: string | null;
  created_at: string;
  sumber: { nama: string } | { nama: string }[] | null;
  creator: { nama: string } | { nama: string }[] | null;
}

/**
 * PostgREST mengembalikan relasi to-one kadang sebagai objek, kadang sebagai
 * array satu elemen tergantung bentuk query. Ditangani di satu tempat supaya
 * pemanggilnya tidak perlu tahu.
 */
function satu<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function mapUangJalan(row: UangJalanRow): UangJalan {
  return {
    id: row.id,
    job_id: row.job_id,
    jenis: row.jenis,
    tanggal: row.tanggal,
    jumlah: Number(row.jumlah),
    sumber_dana_id: row.sumber_dana_id,
    sumber_dana_nama: satu(row.sumber)?.nama ?? null,
    keperluan: row.keperluan,
    catatan: row.catatan,
    created_by_nama: satu(row.creator)?.nama ?? null,
    created_at: row.created_at
  };
}

export async function listSumberDana(
  hanyaAktif = true
): Promise<SumberDana[]> {
  const supabase = await createClient();
  let q = supabase
    .from("sumber_dana")
    .select("id, nama, bank, pemegang, kolom_excel, urutan, is_active")
    .order("urutan")
    .order("nama");
  if (hanyaAktif) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SumberDana[];
}

export async function listUangJalanByJob(jobId: string): Promise<UangJalan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uang_jalan")
    .select(UANG_JALAN_SELECT)
    .eq("job_id", jobId)
    // created_at jadi pemecah seri: beberapa pencairan di tanggal yang sama
    // harus tetap tampil sesuai urutan pencatatannya.
    .order("tanggal", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as UangJalanRow[]).map(mapUangJalan);
}

/**
 * Hitung ringkasan dari daftar transaksi + pagu awal job.
 *
 * Sengaja fungsi murni tanpa query sendiri: pemanggil biasanya sudah memuat
 * daftar transaksinya untuk ditampilkan, jadi tidak perlu bolak-balik ke
 * database hanya untuk menjumlahkan.
 */
export function hitungRingkasan(
  paguAwal: number,
  transaksi: UangJalan[]
): UangJalanRingkasan {
  let penambahan = 0;
  let cair = 0;
  for (const t of transaksi) {
    if (t.jenis === "penambahan_pagu") penambahan += t.jumlah;
    else cair += t.jumlah;
  }
  const pagu = paguAwal + penambahan;
  return {
    pagu_awal: paguAwal,
    penambahan,
    pagu,
    cair,
    sisa: pagu - cair,
    persen_cair: pagu > 0 ? Math.round((cair / pagu) * 100) : 0
  };
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
}

/**
 * Daftar job beserta posisi uang jalannya, untuk halaman pemantauan.
 *
 * Transaksi diambil sekaligus lewat relasi lalu dijumlahkan di sini. Untuk
 * ratusan job per bulan ini masih murah; kalau nanti datanya menahun,
 * pindahkan penjumlahannya ke view atau RPC di database.
 */
export async function listJobUangJalan(opts?: {
  hanyaBelumLunas?: boolean;
  hanyaBerjalan?: boolean;
}): Promise<UangJalanJobRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id, job_number, status, asal, tujuan, etd, uang_jalan_pagu,
      unit:units(kode_unit),
      driver:drivers(nama),
      customer:customers(nama_perusahaan),
      uang_jalan(id, jenis, jumlah, tanggal)
    `
    )
    .neq("status", "cancelled")
    .order("etd", { ascending: false });
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    job_number: string;
    status: string;
    asal: string;
    tujuan: string;
    etd: string;
    uang_jalan_pagu: number | string;
    unit: { kode_unit: string } | { kode_unit: string }[] | null;
    driver: { nama: string } | { nama: string }[] | null;
    customer:
      | { nama_perusahaan: string }
      | { nama_perusahaan: string }[]
      | null;
    uang_jalan:
      | Array<{ id: string; jenis: UangJalan["jenis"]; jumlah: number | string; tanggal: string }>
      | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const transaksi = (r.uang_jalan ?? []).map((t) => ({
      ...t,
      jumlah: Number(t.jumlah)
    }));
    const ringkasan = hitungRingkasan(
      Number(r.uang_jalan_pagu ?? 0),
      transaksi as unknown as UangJalan[]
    );
    const pencairan = transaksi
      .filter((t) => t.jenis === "pencairan")
      .map((t) => t.tanggal)
      .sort();
    return {
      job_id: r.id,
      job_number: r.job_number,
      status: r.status,
      asal: r.asal,
      tujuan: r.tujuan,
      etd: r.etd,
      unit_kode: satu(r.unit)?.kode_unit ?? null,
      driver_nama: satu(r.driver)?.nama ?? null,
      customer_nama: satu(r.customer)?.nama_perusahaan ?? null,
      ringkasan,
      pencairan_terakhir: pencairan.length ? pencairan[pencairan.length - 1] : null
    };
  });

  let hasil = rows;
  if (opts?.hanyaBelumLunas) hasil = hasil.filter((r) => r.ringkasan.sisa > 0);
  if (opts?.hanyaBerjalan)
    hasil = hasil.filter((r) => r.status !== "selesai");
  return hasil;
}

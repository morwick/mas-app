import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Invoice,
  InvoiceItem,
  InvoiceListRow,
  InvoicePayment,
  InvoiceStatus,
  InvoiceTampilStatus,
  JobProfitabilityRow,
  PiutangSummaryRow
} from "@/lib/types";

const INVOICE_SELECT = `
  id, invoice_number, seq_no, seq_tahun,
  customer_id, customer_nama, customer_alamat, customer_npwp,
  pic_sapaan, pic_nama,
  quotation_id,
  kota_terbit, tanggal, termin_hari, jatuh_tempo,
  ppn_aktif, ppn_persen, subtotal, ppn_nominal, total, dibayar,
  status, ttd_nama, ttd_jabatan,
  bank_nama, bank_rekening, bank_atas_nama,
  catatan, alasan_batal,
  sent_at, lunas_at, created_at, updated_at,
  quotation:quotations(quote_number),
  created_by_profile:profiles!invoices_created_by_fkey(nama)
`;

const ITEM_SELECT = `
  id, invoice_id, urutan, job_id, deskripsi, dari, tujuan,
  qty, satuan, harga_satuan, subtotal,
  job:jobs(job_number)
`;

const PAYMENT_SELECT = `
  id, invoice_id, tanggal, jumlah, sumber_dana_id, metode,
  referensi, catatan, created_at,
  sumber:sumber_dana(nama),
  created_by_profile:profiles!invoice_payments_created_by_fkey(nama)
`;

interface InvoiceRow {
  id: string;
  invoice_number: string;
  seq_no: number;
  seq_tahun: number;
  customer_id: string;
  customer_nama: string;
  customer_alamat: string | null;
  customer_npwp: string | null;
  pic_sapaan: string | null;
  pic_nama: string | null;
  quotation_id: string | null;
  kota_terbit: string;
  tanggal: string;
  termin_hari: number | null;
  jatuh_tempo: string | null;
  ppn_aktif: boolean;
  ppn_persen: number | string;
  subtotal: number | string;
  ppn_nominal: number | string;
  total: number | string;
  dibayar: number | string;
  status: InvoiceStatus;
  ttd_nama: string | null;
  ttd_jabatan: string | null;
  bank_nama: string | null;
  bank_rekening: string | null;
  bank_atas_nama: string | null;
  catatan: string | null;
  alasan_batal: string | null;
  sent_at: string | null;
  lunas_at: string | null;
  created_at: string;
  updated_at: string;
  // Supabase mengetikkan embed to-one sebagai array; kedua bentuk ditampung.
  quotation: { quote_number: string } | Array<{ quote_number: string }> | null;
  created_by_profile: { nama: string } | Array<{ nama: string }> | null;
}

interface ItemRow {
  id: string;
  invoice_id: string;
  urutan: number;
  job_id: string | null;
  deskripsi: string;
  dari: string | null;
  tujuan: string | null;
  qty: number;
  satuan: string;
  harga_satuan: number | string;
  subtotal: number | string;
  job: { job_number: string } | Array<{ job_number: string }> | null;
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  tanggal: string;
  jumlah: number | string;
  sumber_dana_id: string | null;
  metode: string;
  referensi: string | null;
  catatan: string | null;
  created_at: string;
  sumber: { nama: string } | Array<{ nama: string }> | null;
  created_by_profile: { nama: string } | Array<{ nama: string }> | null;
}

function flat<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Supabase mengembalikan BIGINT sebagai string ketika nilainya melewati rentang
// aman JS number. Nominal rupiah di sini jauh di bawah batas itu, tapi tetap
// dinormalkan supaya UI tidak pernah menerima string untuk kolom uang.
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tanggal hari ini menurut waktu Indonesia Barat, format YYYY-MM-DD.
 *
 * Server berjalan di UTC, sedangkan "hari ini" bagi admin adalah hari di
 * Pekanbaru. Tanpa penyesuaian ini, tagihan yang jatuh tempo hari ini akan
 * terbaca terlambat sejak pukul 07:00 WIB.
 */
function hariIniWIB(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function selisihHari(dari: string, sampai: string): number {
  const a = new Date(`${dari}T00:00:00Z`).getTime();
  const b = new Date(`${sampai}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Status yang ditampilkan ke pengguna.
 *
 * Jatuh tempo diturunkan dari tanggal, bukan disimpan — mengikuti keputusan
 * yang sama seperti `kedaluwarsa` pada penawaran. Tidak ada cron yang harus
 * berjalan, dan statusnya berubah tepat pada waktunya. Yang tersimpan tetap
 * `terkirim`, jadi begitu pembayaran masuk, statusnya berpindah ke lunas
 * tanpa perlu membereskan sisa status perantara.
 */
function deriveTampil(
  stored: InvoiceStatus,
  jatuhTempo: string | null
): { status_tampil: InvoiceTampilStatus; hari_terlambat: number | null } {
  if (stored !== "terkirim" || !jatuhTempo) {
    return { status_tampil: stored, hari_terlambat: null };
  }
  const hariIni = hariIniWIB();
  const jt = jatuhTempo.slice(0, 10);
  if (jt >= hariIni) return { status_tampil: stored, hari_terlambat: null };
  return {
    status_tampil: "jatuh_tempo",
    hari_terlambat: selisihHari(jt, hariIni)
  };
}

function mapItem(r: ItemRow): InvoiceItem {
  return {
    id: r.id,
    invoice_id: r.invoice_id,
    urutan: r.urutan,
    job_id: r.job_id,
    job_number: flat(r.job)?.job_number ?? null,
    deskripsi: r.deskripsi,
    dari: r.dari,
    tujuan: r.tujuan,
    qty: r.qty,
    satuan: r.satuan,
    harga_satuan: num(r.harga_satuan),
    subtotal: num(r.subtotal)
  };
}

function mapPayment(r: PaymentRow): InvoicePayment {
  return {
    id: r.id,
    invoice_id: r.invoice_id,
    tanggal: r.tanggal,
    jumlah: num(r.jumlah),
    sumber_dana_id: r.sumber_dana_id,
    sumber_dana_nama: flat(r.sumber)?.nama ?? null,
    metode: r.metode,
    referensi: r.referensi,
    catatan: r.catatan,
    created_by_nama: flat(r.created_by_profile)?.nama ?? null,
    created_at: r.created_at
  };
}

function mapInvoice(
  r: InvoiceRow,
  items: InvoiceItem[],
  payments: InvoicePayment[]
): Invoice {
  const total = num(r.total);
  const dibayar = num(r.dibayar);
  const { status_tampil, hari_terlambat } = deriveTampil(r.status, r.jatuh_tempo);

  return {
    id: r.id,
    invoice_number: r.invoice_number,
    seq_no: r.seq_no,
    seq_tahun: r.seq_tahun,
    customer_id: r.customer_id,
    customer_nama: r.customer_nama,
    customer_alamat: r.customer_alamat,
    customer_npwp: r.customer_npwp,
    pic_sapaan: (r.pic_sapaan as "Bapak" | "Ibu" | null) ?? null,
    pic_nama: r.pic_nama,
    quotation_id: r.quotation_id,
    quotation_number: flat(r.quotation)?.quote_number ?? null,
    kota_terbit: r.kota_terbit,
    tanggal: r.tanggal,
    termin_hari: r.termin_hari,
    jatuh_tempo: r.jatuh_tempo,
    ppn_aktif: r.ppn_aktif,
    ppn_persen: num(r.ppn_persen),
    subtotal: num(r.subtotal),
    ppn_nominal: num(r.ppn_nominal),
    total,
    dibayar,
    sisa: total - dibayar,
    status: r.status,
    status_tampil,
    hari_terlambat,
    ttd_nama: r.ttd_nama,
    ttd_jabatan: r.ttd_jabatan,
    bank_nama: r.bank_nama,
    bank_rekening: r.bank_rekening,
    bank_atas_nama: r.bank_atas_nama,
    catatan: r.catatan,
    alasan_batal: r.alasan_batal,
    sent_at: r.sent_at,
    lunas_at: r.lunas_at,
    created_by_nama: flat(r.created_by_profile)?.nama ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    items,
    payments
  };
}

export async function listInvoices(opts?: {
  status?: InvoiceStatus;
  customerId?: string;
  limit?: number;
}): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("invoices")
    .select(`${INVOICE_SELECT}, invoice_items(id)`)
    .order("seq_tahun", { ascending: false })
    .order("seq_no", { ascending: false });

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as unknown as Array<
      InvoiceRow & { invoice_items: Array<{ id: string }> | null }
    >
  ).map((r) => {
    const { items: _i, payments: _p, ...rest } = mapInvoice(r, [], []);
    return {
      ...rest,
      jumlah_item: r.invoice_items?.length ?? 0
    } as InvoiceListRow;
  });
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase.from("invoice_items").select(ITEM_SELECT).eq("invoice_id", id).order("urutan"),
    supabase
      .from("invoice_payments")
      .select(PAYMENT_SELECT)
      .eq("invoice_id", id)
      .order("tanggal", { ascending: false })
      .order("created_at", { ascending: false })
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  return mapInvoice(
    data as unknown as InvoiceRow,
    ((itemsRes.data ?? []) as unknown as ItemRow[]).map(mapItem),
    ((paymentsRes.data ?? []) as unknown as PaymentRow[]).map(mapPayment)
  );
}

/**
 * Nomor yang akan dipakai tagihan berikutnya — untuk pratinjau di form.
 *
 * Sengaja TIDAK memanggil next_invoice_number(): fungsi itu menaikkan counter,
 * jadi nomor akan terbakar setiap kali form dibuka walau tagihannya batal
 * disimpan. Nomor final tetap ditetapkan database saat simpan.
 */
export async function peekNextInvoiceNumber(): Promise<string> {
  const supabase = await createClient();
  const tahun = new Date().getFullYear();
  const { data } = await supabase
    .from("invoices")
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
  return `${String(next).padStart(4, "0")}/INV/MAS/${bulan}/${tahun}`;
}

/**
 * Job selesai milik satu customer yang belum pernah masuk tagihan mana pun.
 *
 * Ini yang membuat pembuatan invoice tidak perlu mengetik ulang: admin memilih
 * customer, lalu memilih job mana yang ditagihkan. Job yang sudah ditagih
 * tidak muncul lagi, sehingga tagihan ganda tidak bisa terjadi karena lupa.
 */
export interface JobBelumDitagihRow {
  id: string;
  job_number: string;
  asal: string;
  tujuan: string;
  alat_diangkut: string;
  etd: string;
  completed_at: string | null;
}

/**
 * Job selesai yang belum masuk tagihan mana pun, dikelompokkan per customer.
 *
 * Dikembalikan sekaligus untuk semua customer, bukan per customer: form
 * tagihan perlu daftarnya begitu customer dipilih, dan menariknya satu per
 * satu berarti satu query untuk setiap customer di master hanya untuk
 * menyiapkan satu dropdown.
 */
export async function listJobsBelumDitagihPerCustomer(
  customerId?: string
): Promise<Record<string, JobBelumDitagihRow[]>> {
  const supabase = await createClient();

  const { data: sudah, error: errSudah } = await supabase
    .from("invoice_items")
    .select("job_id, invoice:invoices(status)")
    .not("job_id", "is", null);
  if (errSudah) throw new Error(errSudah.message);

  // Tagihan yang dibatalkan tidak menghalangi job ditagih ulang — itu justru
  // alasan paling umum sebuah invoice dibatalkan.
  const sudahDitagih = new Set(
    (
      (sudah ?? []) as Array<{
        job_id: string | null;
        invoice: { status: string } | Array<{ status: string }> | null;
      }>
    )
      .filter((r) => flat(r.invoice)?.status !== "batal")
      .map((r) => r.job_id)
      .filter((v): v is string => Boolean(v))
  );

  let q = supabase
    .from("jobs")
    .select(
      "id, customer_id, job_number, asal, tujuan, alat_diangkut, etd, completed_at"
    )
    .eq("status", "selesai")
    .order("completed_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const out: Record<string, JobBelumDitagihRow[]> = {};
  for (const row of (data ?? []) as Array<
    JobBelumDitagihRow & { customer_id: string }
  >) {
    if (sudahDitagih.has(row.id)) continue;
    const { customer_id, ...job } = row;
    (out[customer_id] ??= []).push(job);
  }
  return out;
}

/** Rekap piutang per customer, termasuk umur tunggakan. */
export async function getPiutangSummary(): Promise<PiutangSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_piutang_summary");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    customer_id: String(r.customer_id),
    customer_nama: String(r.customer_nama ?? "—"),
    jumlah_invoice: Number(r.jumlah_invoice ?? 0),
    total_tagihan: num(r.total_tagihan as number | string),
    total_dibayar: num(r.total_dibayar as number | string),
    sisa: num(r.sisa as number | string),
    belum_jatuh_tempo: num(r.belum_jatuh_tempo as number | string),
    umur_1_30: num(r.umur_1_30 as number | string),
    umur_31_60: num(r.umur_31_60 as number | string),
    umur_60_plus: num(r.umur_60_plus as number | string)
  }));
}

/** Laba per job — pendapatan invoice dikurangi uang jalan & biaya insiden. */
export async function getJobProfitability(opts?: {
  start?: string;
  end?: string;
}): Promise<JobProfitabilityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_job_profitability", {
    p_start: opts?.start ?? null,
    p_end: opts?.end ?? null
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    job_id: String(r.job_id),
    job_number: String(r.job_number),
    customer_nama: String(r.customer_nama ?? "—"),
    unit_kode: String(r.unit_kode ?? "—"),
    etd: String(r.etd),
    status: r.status as JobProfitabilityRow["status"],
    pendapatan: num(r.pendapatan as number | string),
    uang_jalan: num(r.uang_jalan as number | string),
    biaya_insiden: num(r.biaya_insiden as number | string),
    laba: num(r.laba as number | string)
  }));
}

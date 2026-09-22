"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import type { InvoiceStatus } from "@/lib/types";

export interface InvoiceItemInput {
  /** Job yang ditagihkan baris ini. Null untuk baris di luar job. */
  job_id?: string | null;
  deskripsi: string;
  dari?: string | null;
  tujuan?: string | null;
  qty: number;
  satuan: string;
  harga_satuan: number;
}

export interface InvoiceInput {
  customer_id: string;
  quotation_id?: string | null;
  pic_sapaan?: "Bapak" | "Ibu" | null;
  pic_nama?: string | null;
  kota_terbit: string;
  tanggal: string;
  termin_hari?: number | null;
  jatuh_tempo?: string | null;
  ppn_aktif: boolean;
  ppn_persen: number;
  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  bank_nama?: string | null;
  bank_rekening?: string | null;
  bank_atas_nama?: string | null;
  catatan?: string | null;
  items: InvoiceItemInput[];
}

/**
 * Status yang isinya masih boleh diubah.
 *
 * Tagihan yang sudah lunas dikunci: mengubah angkanya setelah uang masuk akan
 * membuat catatan pembayaran tidak lagi cocok dengan totalnya. Yang batal juga
 * dikunci — kalau perlu ditagih lagi, terbitkan nomor baru supaya arsipnya
 * tetap bisa ditelusuri.
 */
const EDITABLE_STATUSES: InvoiceStatus[] = ["draft", "terkirim"];

function validate(input: InvoiceInput): string | null {
  if (!input.customer_id) return "Customer wajib dipilih";
  if (!input.tanggal) return "Tanggal tagihan wajib diisi";
  if (!input.kota_terbit?.trim()) return "Kota penerbitan wajib diisi";
  if (!input.items?.length) return "Minimal satu baris rincian harus diisi";

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const no = i + 1;
    if (!it.deskripsi?.trim()) return `Baris ${no}: uraian wajib diisi`;
    if (!Number.isFinite(it.qty) || it.qty <= 0)
      return `Baris ${no}: jumlah harus lebih dari 0`;
    if (!Number.isFinite(it.harga_satuan) || it.harga_satuan < 0)
      return `Baris ${no}: harga satuan tidak valid`;
  }

  if (input.ppn_aktif && (input.ppn_persen < 0 || input.ppn_persen > 100))
    return "Persentase PPN harus antara 0 dan 100";

  if (input.termin_hari != null && input.termin_hari < 0)
    return "Termin tidak boleh negatif";

  return null;
}

/**
 * Jatuh tempo = tanggal tagihan + termin, kecuali admin mengisinya sendiri.
 * Dihitung di sini (bukan di database) supaya admin bisa menimpanya untuk
 * kesepakatan khusus tanpa perlu kolom penanda tambahan.
 */
function hitungJatuhTempo(input: InvoiceInput): string | null {
  if (input.jatuh_tempo) return input.jatuh_tempo;
  if (input.termin_hari == null) return null;
  const d = new Date(`${input.tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + input.termin_hari);
  return d.toISOString().slice(0, 10);
}

function itemRows(invoiceId: string, items: InvoiceItemInput[]) {
  return items.map((it, idx) => ({
    invoice_id: invoiceId,
    urutan: idx + 1,
    job_id: it.job_id || null,
    deskripsi: it.deskripsi.trim(),
    dari: it.dari?.trim() || null,
    tujuan: it.tujuan?.trim() || null,
    qty: Math.trunc(it.qty),
    satuan: it.satuan?.trim() || "Unit",
    harga_satuan: Math.round(it.harga_satuan)
  }));
}

export async function createInvoiceAction(
  input: InvoiceInput
): Promise<ActionResult<{ id: string; invoice_number: string }>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Snapshot data customer. Tagihan yang sudah terbit tidak boleh ikut berubah
  // kalau master customer di-edit belakangan — untuk dokumen pajak, isinya
  // harus tetap seperti saat diterbitkan.
  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select("nama_perusahaan, alamat, npwp, pic_sapaan, pic_nama, termin_hari")
    .eq("id", input.customer_id)
    .maybeSingle();
  if (custErr) return { ok: false, error: custErr.message };
  if (!cust) return { ok: false, error: "Customer tidak ditemukan" };

  const c = cust as {
    nama_perusahaan: string;
    alamat: string | null;
    npwp: string | null;
    pic_sapaan: string | null;
    pic_nama: string | null;
    termin_hari: number | null;
  };

  const termin = input.termin_hari ?? c.termin_hari ?? null;
  const jatuhTempo = hitungJatuhTempo({ ...input, termin_hari: termin });

  // Nomor diambil dari database (atomik), bukan dihitung di sini — dua admin
  // yang menyimpan bersamaan tetap mendapat nomor berbeda.
  const { data: numData, error: numErr } = await supabase.rpc(
    "next_invoice_number"
  );
  if (numErr)
    return { ok: false, error: `Gagal ambil nomor tagihan: ${numErr.message}` };

  const nomor = Array.isArray(numData) ? numData[0] : numData;
  if (!nomor?.nomor)
    return { ok: false, error: "Gagal ambil nomor tagihan dari database" };

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: nomor.nomor,
      seq_no: nomor.seq,
      seq_tahun: nomor.tahun,
      customer_id: input.customer_id,
      customer_nama: c.nama_perusahaan,
      customer_alamat: c.alamat,
      customer_npwp: c.npwp,
      pic_sapaan: input.pic_sapaan ?? c.pic_sapaan ?? null,
      pic_nama: input.pic_nama?.trim() || c.pic_nama || null,
      quotation_id: input.quotation_id || null,
      kota_terbit: input.kota_terbit.trim(),
      tanggal: input.tanggal,
      termin_hari: termin,
      jatuh_tempo: jatuhTempo,
      ppn_aktif: input.ppn_aktif,
      ppn_persen: input.ppn_persen,
      ttd_nama: input.ttd_nama?.trim() || null,
      ttd_jabatan: input.ttd_jabatan?.trim() || "Admin",
      bank_nama: input.bank_nama?.trim() || null,
      bank_rekening: input.bank_rekening?.trim() || null,
      bank_atas_nama: input.bank_atas_nama?.trim() || null,
      catatan: input.catatan?.trim() || null,
      created_by: user?.id ?? null
    })
    .select("id, invoice_number")
    .single();
  if (error) return { ok: false, error: error.message };

  const row = created as { id: string; invoice_number: string };

  const { error: itemErr } = await supabase
    .from("invoice_items")
    .insert(itemRows(row.id, input.items));
  if (itemErr) {
    // Header tanpa rincian tidak ada gunanya — buang supaya tidak jadi sampah
    // di daftar. Nomornya memang hangus, itu konsekuensi wajar demi urutan
    // yang tidak pernah dipakai ulang.
    await supabase.from("invoices").delete().eq("id", row.id);
    return { ok: false, error: `Gagal simpan rincian: ${itemErr.message}` };
  }

  revalidatePath("/invoices");
  revalidatePath("/piutang");
  return { ok: true, data: { id: row.id, invoice_number: row.invoice_number } };
}

export async function updateInvoiceAction(
  id: string,
  input: InvoiceInput
): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();

  const { data: existing, error: readErr } = await supabase
    .from("invoices")
    .select("status, dibayar, termin_hari")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) return { ok: false, error: "Tagihan tidak ditemukan" };

  const row = existing as {
    status: InvoiceStatus;
    dibayar: number | string;
    termin_hari: number | null;
  };

  if (!EDITABLE_STATUSES.includes(row.status))
    return {
      ok: false,
      error:
        row.status === "lunas"
          ? "Tagihan yang sudah lunas tidak bisa diubah. Hapus pembayarannya dulu bila memang perlu direvisi."
          : "Tagihan yang dibatalkan tidak bisa diubah. Terbitkan tagihan baru."
    };

  const termin = input.termin_hari ?? row.termin_hari ?? null;

  const { error } = await supabase
    .from("invoices")
    .update({
      pic_sapaan: input.pic_sapaan ?? null,
      pic_nama: input.pic_nama?.trim() || null,
      quotation_id: input.quotation_id || null,
      kota_terbit: input.kota_terbit.trim(),
      tanggal: input.tanggal,
      termin_hari: termin,
      jatuh_tempo: hitungJatuhTempo({ ...input, termin_hari: termin }),
      ppn_aktif: input.ppn_aktif,
      ppn_persen: input.ppn_persen,
      ttd_nama: input.ttd_nama?.trim() || null,
      ttd_jabatan: input.ttd_jabatan?.trim() || "Admin",
      bank_nama: input.bank_nama?.trim() || null,
      bank_rekening: input.bank_rekening?.trim() || null,
      bank_atas_nama: input.bank_atas_nama?.trim() || null,
      catatan: input.catatan?.trim() || null
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Rincian diganti utuh, bukan di-diff: baris bisa ditambah, dihapus, atau
  // diurutkan ulang bebas di form, dan urutan cetak harus persis mengikuti.
  const { error: delErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);
  if (delErr) return { ok: false, error: delErr.message };

  const { error: insErr } = await supabase
    .from("invoice_items")
    .insert(itemRows(id, input.items));
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/invoices/${id}/edit`);
  revalidatePath("/piutang");
  return { ok: true, data: undefined };
}

/**
 * Ubah status tagihan.
 *
 * `lunas` sengaja tidak diterima di sini: itu satu-satunya status yang lahir
 * dari kejadian, bukan dari keputusan. Sebuah tagihan menjadi lunas karena
 * pembayarannya menutup totalnya — kalau boleh diketik juga, akan ada dua
 * sumber kebenaran untuk pertanyaan "sudah dibayar belum".
 */
export async function setInvoiceStatusAction(
  id: string,
  status: Exclude<InvoiceStatus, "lunas">,
  opts?: { alasan?: string | null }
): Promise<ActionResult> {
  const supabase = await createClient();

  const payload: Record<string, unknown> = { status };
  if (status === "terkirim") payload.sent_at = new Date().toISOString();
  if (status === "batal") payload.alasan_batal = opts?.alasan?.trim() || null;
  // Dibuka kembali ke draft → jejak pengiriman sebelumnya dibersihkan supaya
  // tidak menyesatkan saat tagihan diterbitkan ulang.
  if (status === "draft") {
    payload.sent_at = null;
    payload.alasan_batal = null;
  }

  const { error } = await supabase.from("invoices").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/piutang");
  return { ok: true, data: undefined };
}

export interface PaymentInput {
  tanggal: string;
  jumlah: number;
  sumber_dana_id?: string | null;
  metode?: string | null;
  referensi?: string | null;
  catatan?: string | null;
}

export async function addInvoicePaymentAction(
  invoiceId: string,
  input: PaymentInput
): Promise<ActionResult> {
  if (!input.tanggal) return { ok: false, error: "Tanggal wajib diisi" };
  if (!Number.isFinite(input.jumlah) || input.jumlah <= 0)
    return { ok: false, error: "Jumlah pembayaran harus lebih dari 0" };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: inv, error: readErr } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!inv) return { ok: false, error: "Tagihan tidak ditemukan" };
  if ((inv as { status: InvoiceStatus }).status === "draft")
    return {
      ok: false,
      error: "Tandai tagihan sebagai terkirim dulu sebelum mencatat pembayaran."
    };
  if ((inv as { status: InvoiceStatus }).status === "batal")
    return { ok: false, error: "Tagihan sudah dibatalkan." };

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id: invoiceId,
    tanggal: input.tanggal,
    jumlah: Math.round(input.jumlah),
    sumber_dana_id: input.sumber_dana_id || null,
    metode: input.metode?.trim() || "transfer",
    referensi: input.referensi?.trim() || null,
    catatan: input.catatan?.trim() || null,
    created_by: user?.id ?? null
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/piutang");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function deleteInvoicePaymentAction(
  paymentId: string,
  invoiceId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_payments")
    .delete()
    .eq("id", paymentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/piutang");
  return { ok: true, data: undefined };
}

export async function deleteInvoiceAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/invoices");
  revalidatePath("/piutang");
  return { ok: true, data: undefined };
}

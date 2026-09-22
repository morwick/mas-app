"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";
import type { QuotationStatus } from "@/lib/types";

export interface QuotationItemInput {
  dari: string;
  tujuan: string;
  qty: number;
  satuan: string;
  nama_alat?: string | null;
  harga_satuan: number;
}

export interface QuotationInput {
  customer_id: string;
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
  ttd_nama?: string | null;
  ttd_jabatan?: string | null;
  catatan?: string | null;
  items: QuotationItemInput[];
}

/** Status yang isinya masih boleh diubah. Penawaran yang sudah `deal` dikunci
 *  karena job (dan nanti invoice) sudah menggantungkan harganya ke sana. */
const EDITABLE_STATUSES: QuotationStatus[] = [
  "draft",
  "terkirim",
  "ditolak",
  "kedaluwarsa"
];

function validate(input: QuotationInput): string | null {
  if (!input.customer_id) return "Customer wajib dipilih";
  if (!input.tanggal) return "Tanggal surat wajib diisi";
  if (!input.kota_terbit?.trim()) return "Kota penerbitan wajib diisi";
  if (!input.perihal?.trim()) return "Perihal wajib diisi";
  if (!input.items?.length) return "Minimal satu baris rincian harus diisi";

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const no = i + 1;
    if (!it.dari?.trim()) return `Baris ${no}: kolom "Dari" wajib diisi`;
    if (!it.tujuan?.trim()) return `Baris ${no}: kolom "Tujuan" wajib diisi`;
    if (!Number.isFinite(it.qty) || it.qty <= 0)
      return `Baris ${no}: jumlah unit harus lebih dari 0`;
    if (!Number.isFinite(it.harga_satuan) || it.harga_satuan < 0)
      return `Baris ${no}: harga satuan tidak valid`;
  }

  if (input.ppn_aktif && (input.ppn_persen < 0 || input.ppn_persen > 100))
    return "Persentase PPN harus antara 0 dan 100";

  return null;
}

function itemRows(quotationId: string, items: QuotationItemInput[]) {
  return items.map((it, idx) => ({
    quotation_id: quotationId,
    urutan: idx + 1,
    dari: it.dari.trim(),
    tujuan: it.tujuan.trim(),
    qty: Math.trunc(it.qty),
    satuan: it.satuan?.trim() || "Unit",
    nama_alat: it.nama_alat?.trim() || null,
    harga_satuan: Math.round(it.harga_satuan)
  }));
}

export async function createQuotationAction(
  input: QuotationInput
): Promise<ActionResult<{ id: string; quote_number: string }>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Snapshot data customer. Surat yang sudah dikirim tidak boleh ikut berubah
  // kalau master customer di-edit belakangan.
  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select("nama_perusahaan, kota, pic_sapaan, pic_nama")
    .eq("id", input.customer_id)
    .maybeSingle();
  if (custErr) return { ok: false, error: custErr.message };
  if (!cust) return { ok: false, error: "Customer tidak ditemukan" };

  const c = cust as {
    nama_perusahaan: string;
    kota: string | null;
    pic_sapaan: string | null;
    pic_nama: string | null;
  };

  // Nomor diambil dari database (atomik), bukan dihitung di sini — dua admin
  // yang menyimpan bersamaan tetap mendapat nomor berbeda.
  const { data: numData, error: numErr } = await supabase.rpc(
    "next_quotation_number"
  );
  if (numErr) return { ok: false, error: `Gagal ambil nomor surat: ${numErr.message}` };

  const nomor = Array.isArray(numData) ? numData[0] : numData;
  if (!nomor?.nomor)
    return { ok: false, error: "Gagal ambil nomor surat dari database" };

  const { data: created, error } = await supabase
    .from("quotations")
    .insert({
      quote_number: nomor.nomor,
      seq_no: nomor.seq,
      seq_tahun: nomor.tahun,
      customer_id: input.customer_id,
      customer_nama: c.nama_perusahaan,
      customer_kota: c.kota,
      pic_sapaan: input.pic_sapaan ?? c.pic_sapaan ?? null,
      pic_nama: input.pic_nama?.trim() || c.pic_nama || null,
      kota_terbit: input.kota_terbit.trim(),
      tanggal: input.tanggal,
      berlaku_sampai: input.berlaku_sampai || null,
      perihal: input.perihal.trim(),
      objek: input.objek?.trim() || null,
      lampiran: input.lampiran?.trim() || "-",
      ppn_aktif: input.ppn_aktif,
      ppn_persen: input.ppn_persen,
      ttd_nama: input.ttd_nama?.trim() || null,
      ttd_jabatan: input.ttd_jabatan?.trim() || "Admin",
      catatan: input.catatan?.trim() || null,
      created_by: user?.id ?? null
    })
    .select("id, quote_number")
    .single();
  if (error) return { ok: false, error: error.message };

  const row = created as { id: string; quote_number: string };

  const { error: itemErr } = await supabase
    .from("quotation_items")
    .insert(itemRows(row.id, input.items));
  if (itemErr) {
    // Header tanpa rincian tidak ada gunanya — buang supaya tidak jadi sampah
    // di daftar. Nomornya memang hangus, itu konsekuensi wajar demi urutan
    // yang tidak pernah dipakai ulang.
    await supabase.from("quotations").delete().eq("id", row.id);
    return { ok: false, error: `Gagal simpan rincian: ${itemErr.message}` };
  }

  revalidatePath("/quotations");
  return { ok: true, data: { id: row.id, quote_number: row.quote_number } };
}

export async function updateQuotationAction(
  id: string,
  input: QuotationInput
): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();

  const { data: existing, error: readErr } = await supabase
    .from("quotations")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) return { ok: false, error: "Penawaran tidak ditemukan" };

  const status = (existing as { status: QuotationStatus }).status;
  if (!EDITABLE_STATUSES.includes(status))
    return {
      ok: false,
      error:
        "Penawaran yang sudah deal tidak bisa diubah. Batalkan status deal-nya dulu bila memang perlu direvisi."
    };

  const { error } = await supabase
    .from("quotations")
    .update({
      pic_sapaan: input.pic_sapaan ?? null,
      pic_nama: input.pic_nama?.trim() || null,
      kota_terbit: input.kota_terbit.trim(),
      tanggal: input.tanggal,
      berlaku_sampai: input.berlaku_sampai || null,
      perihal: input.perihal.trim(),
      objek: input.objek?.trim() || null,
      lampiran: input.lampiran?.trim() || "-",
      ppn_aktif: input.ppn_aktif,
      ppn_persen: input.ppn_persen,
      ttd_nama: input.ttd_nama?.trim() || null,
      ttd_jabatan: input.ttd_jabatan?.trim() || "Admin",
      catatan: input.catatan?.trim() || null
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Rincian diganti utuh, bukan di-diff: baris bisa ditambah, dihapus, atau
  // diurutkan ulang bebas di form, dan urutan cetak harus persis mengikuti.
  const { error: delErr } = await supabase
    .from("quotation_items")
    .delete()
    .eq("quotation_id", id);
  if (delErr) return { ok: false, error: delErr.message };

  const { error: insErr } = await supabase
    .from("quotation_items")
    .insert(itemRows(id, input.items));
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  revalidatePath(`/quotations/${id}/edit`);
  return { ok: true, data: undefined };
}

export async function setQuotationStatusAction(
  id: string,
  status: QuotationStatus,
  opts?: { alasan?: string | null }
): Promise<ActionResult> {
  const supabase = await createClient();

  const payload: Record<string, unknown> = { status };
  if (status === "terkirim") payload.sent_at = new Date().toISOString();
  if (status === "deal" || status === "ditolak")
    payload.decided_at = new Date().toISOString();
  if (status === "ditolak") payload.alasan_ditolak = opts?.alasan?.trim() || null;
  // Dibuka kembali ke draft → jejak keputusan sebelumnya dibersihkan supaya
  // tidak menyesatkan saat surat dikirim ulang.
  if (status === "draft") {
    payload.sent_at = null;
    payload.decided_at = null;
    payload.alasan_ditolak = null;
  }

  const { error } = await supabase
    .from("quotations")
    .update(payload)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteQuotationAction(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/quotations");
  return { ok: true, data: undefined };
}

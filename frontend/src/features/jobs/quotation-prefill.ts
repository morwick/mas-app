/**
 * Prefill form job dari satu item penawaran yang sudah deal.
 *
 * Tabel jobs tidak punya kolom harga — angka resminya tinggal di penawaran dan
 * job menunjuk ke sana lewat quotation_id. Ringkasan komersial ikut ke kolom
 * catatan supaya orang lapangan yang membuka job bisa langsung melihat nilainya
 * tanpa berpindah halaman.
 */

import { formatRupiah } from "@/lib/utils";
import type { Customer, Quotation, QuotationItem } from "@/types";
import type { JobPrefill } from "./components/new-job-view";

function buildCatatan(q: Quotation, item: QuotationItem, customer: Customer | null): string {
  const lines: string[] = [];
  const no = q.items.findIndex((x) => x.id === item.id) + 1;
  lines.push(`[Dari penawaran ${q.quote_number} — item ${no}]`);
  if (q.objek) lines.push(`Objek: ${q.objek}`);

  lines.push("");
  lines.push("--- Harga ---");
  lines.push(
    `${item.dari} → ${item.tujuan} · ${item.qty} ${item.satuan}` +
      `${item.nama_alat ? ` ${item.nama_alat}` : ""} @ ${formatRupiah(item.harga_final)}` +
      ` = ${formatRupiah(item.subtotal_final)}`
  );
  if (item.harga_revisi != null) {
    lines.push(`(Harga revisi — harga awal ${formatRupiah(item.harga_satuan)} = ${formatRupiah(item.subtotal)})`);
  }
  if (q.ppn_aktif) lines.push(`+ PPN ${Number(q.ppn_persen)}%`);

  if (customer) {
    lines.push("");
    lines.push("--- Customer ---");
    if (customer.npwp) lines.push(`NPWP: ${customer.npwp}`);
    if (customer.nib) lines.push(`NIB: ${customer.nib}`);
    lines.push(`Status: ${customer.status_pkp ? "PKP" : "Non-PKP"}`);
    lines.push(
      `Termin: ${customer.termin_hari != null ? `${customer.termin_hari} hari` : "cash"}`
    );
  }

  return lines.join("\n");
}

/**
 * Item penawaran yang dibuatkan job: yang diminta (`itemId`) bila deal, atau
 * satu-satunya item deal. Null = harus dipilih dulu dari halaman penawaran.
 */
export function pilihItemDeal(q: Quotation, itemId?: string | null): QuotationItem | null {
  const deal = q.items.filter((it) => it.keputusan === "deal");
  if (itemId) return deal.find((it) => it.id === itemId) ?? null;
  return deal.length === 1 ? deal[0] : null;
}

/** Satu job = satu item penawaran yang deal (rute, alat, dan harga final-nya). */
export function buildPrefill(q: Quotation, item: QuotationItem, customer: Customer | null): JobPrefill {
  const no = q.items.findIndex((x) => x.id === item.id) + 1;
  return {
    quotation_id: q.id,
    quotation_item_id: item.id,
    quote_number: q.quote_number,
    item_label: `item ${no}: ${item.dari} → ${item.tujuan}`,
    customer_id: q.customer_id,
    pic_nama: q.pic_nama ?? customer?.pic_nama ?? "",
    pic_no_hp: customer?.pic_no_hp ?? "",
    alat_diangkut: item.nama_alat ?? q.objek ?? "",
    asal: item.dari,
    tujuan: item.tujuan,
    catatan: buildCatatan(q, item, customer)
  };
}

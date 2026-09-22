/**
 * Prefill form job dari penawaran yang sudah deal.
 *
 * Tabel jobs tidak punya kolom harga — angka resminya tinggal di penawaran dan
 * job menunjuk ke sana lewat quotation_id. Ringkasan komersial ikut ke kolom
 * catatan supaya orang lapangan yang membuka job bisa langsung melihat nilainya
 * tanpa berpindah halaman.
 */

import { formatRupiah } from "@/lib/utils";
import type { Customer, Quotation } from "@/types";
import type { JobPrefill } from "./components/new-job-view";

function buildCatatan(q: Quotation, customer: Customer | null): string {
  const lines: string[] = [];
  lines.push(`[Dari penawaran ${q.quote_number}]`);
  if (q.objek) lines.push(`Objek: ${q.objek}`);

  lines.push("");
  lines.push("--- Harga ---");
  q.items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${it.dari} → ${it.tujuan} · ${it.qty} ${it.satuan}` +
        `${it.nama_alat ? ` ${it.nama_alat}` : ""} @ ${formatRupiah(it.harga_satuan)}` +
        ` = ${formatRupiah(it.subtotal)}`
    );
  });
  lines.push(`Subtotal: ${formatRupiah(q.subtotal)}`);
  if (q.ppn_aktif) lines.push(`PPN ${Number(q.ppn_persen)}%: ${formatRupiah(q.ppn_nominal)}`);
  lines.push(`TOTAL: ${formatRupiah(q.total)}`);

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
 * Rute diambil dari baris pertama penawaran — satu job memodelkan satu
 * perjalanan A → B, sedangkan penawaran bisa memuat beberapa rute. Sisanya
 * diberitahukan ke admin lewat banner, bukan diam-diam dibuang.
 */
export function buildPrefill(q: Quotation, customer: Customer | null): JobPrefill {
  const first = q.items[0];
  return {
    quotation_id: q.id,
    quote_number: q.quote_number,
    jumlah_rute: q.items.length,
    customer_id: q.customer_id,
    pic_nama: q.pic_nama ?? customer?.pic_nama ?? "",
    pic_no_hp: customer?.pic_no_hp ?? "",
    alat_diangkut: q.objek ?? first?.nama_alat ?? "",
    asal: first?.dari ?? "",
    tujuan: first?.tujuan ?? "",
    catatan: buildCatatan(q, customer)
  };
}

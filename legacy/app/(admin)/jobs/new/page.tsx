import { listCustomers, getCustomer } from "@/lib/queries/customers";
import { listDrivers } from "@/lib/queries/drivers";
import { listUnits } from "@/lib/queries/units";
import { listJobs } from "@/lib/queries/jobs";
import { getQuotation } from "@/lib/queries/quotations";
import { NewJobView, type JobPrefill } from "@/components/jobs/new-job-view";
import { formatRupiah } from "@/lib/utils";
import type { Customer, Quotation } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Ringkasan komersial yang ikut ke kolom catatan job.
 *
 * Tabel jobs tidak punya kolom harga — angka resminya tinggal di penawaran dan
 * job menunjuk ke sana lewat quotation_id. Ringkasan ini murni supaya orang
 * lapangan yang membuka job bisa langsung melihat nilainya tanpa berpindah
 * halaman.
 */
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
  if (q.ppn_aktif)
    lines.push(
      `PPN ${Number(q.ppn_persen)}%: ${formatRupiah(q.ppn_nominal)}`
    );
  lines.push(`TOTAL: ${formatRupiah(q.total)}`);

  if (customer) {
    lines.push("");
    lines.push("--- Customer ---");
    if (customer.npwp) lines.push(`NPWP: ${customer.npwp}`);
    if (customer.nib) lines.push(`NIB: ${customer.nib}`);
    lines.push(`Status: ${customer.status_pkp ? "PKP" : "Non-PKP"}`);
    lines.push(
      `Termin: ${
        customer.termin_hari != null ? `${customer.termin_hari} hari` : "cash"
      }`
    );
  }

  return lines.join("\n");
}

/**
 * Rute diambil dari baris pertama penawaran — satu job memodelkan satu
 * perjalanan A → B, sedangkan penawaran bisa memuat beberapa rute. Sisanya
 * diberitahukan ke admin lewat banner, bukan diam-diam dibuang.
 */
function buildPrefill(q: Quotation, customer: Customer | null): JobPrefill {
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

export default async function NewJobPage({
  searchParams
}: {
  searchParams: Promise<{ quotation?: string }>;
}) {
  const { quotation: quotationId } = await searchParams;

  const [customers, drivers, units, activeJobs] = await Promise.all([
    listCustomers(),
    listDrivers(),
    listUnits(),
    listJobs({ status: "active" })
  ]);

  let prefill: JobPrefill | undefined;
  if (quotationId) {
    const quotation = await getQuotation(quotationId);
    // Hanya penawaran yang sudah deal yang boleh naik jadi job. Kalau statusnya
    // lain (atau id-nya ngawur), form dibuka kosong seperti biasa.
    if (quotation && quotation.status === "deal") {
      const customer = await getCustomer(quotation.customer_id);
      prefill = buildPrefill(quotation, customer);
    }
  }

  return (
    <NewJobView
      customers={customers}
      drivers={drivers}
      standbyUnits={units.filter((u) => u.status === "standby")}
      activeJobs={activeJobs}
      prefill={prefill}
    />
  );
}

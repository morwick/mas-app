import type { Invoice, InvoiceItem } from "@/types";

/** Satu baris rincian yang ditampilkan/dicetak. */
export type BarisRincian =
  | {
      jenis: "proyek";
      key: string;
      proyekId: string;
      proyekNomor: string | null;
      uraian: string;
      nominal: number;
      /** Job proyek ini (baris invoice_items dengan proyek_id sama). */
      jobs: InvoiceItem[];
    }
  | { jenis: "item"; key: string; item: InvoiceItem };

/**
 * Rincian tagihan per proyek: tiap baris proyek membawa job-jobnya, sisanya
 * (baris di luar proyek, atau tagihan lama yang belum per proyek) tampil per
 * baris seperti biasa — sesudah baris proyek.
 */
export function susunRincian(inv: Pick<Invoice, "proyek" | "items">): BarisRincian[] {
  const proyek = inv.proyek ?? [];
  const proyekIds = new Set(proyek.map((p) => p.proyek_id));
  const barisProyek: BarisRincian[] = proyek.map((p) => ({
    jenis: "proyek",
    key: p.id,
    proyekId: p.proyek_id,
    proyekNomor: p.proyek_nomor ?? null,
    uraian: p.uraian,
    nominal: p.nominal,
    jobs: inv.items.filter((it) => it.job_id && it.proyek_id === p.proyek_id)
  }));
  const lainnya: BarisRincian[] = inv.items
    .filter((it) => !(it.job_id && it.proyek_id && proyekIds.has(it.proyek_id)))
    .map((it) => ({ jenis: "item", key: it.id, item: it }));
  return [...barisProyek, ...lainnya];
}

/** Total uang jalan yang sudah dikeluarkan (cair) & uang jalan job-job ini. */
export function totalUangJalan(jobs: { uang_jalan_cair?: number | null; uang_jalan_total?: number | null }[]) {
  return {
    cair: jobs.reduce((s, j) => s + (j.uang_jalan_cair ?? 0), 0),
    total: jobs.reduce((s, j) => s + (j.uang_jalan_total ?? 0), 0)
  };
}

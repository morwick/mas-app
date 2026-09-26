import { describe, expect, it } from "vitest";
import type { Quotation, QuotationItem } from "@/types";
import { buildPrefill, pilihItemDeal } from "./quotation-prefill";

function item(id: string, keputusan: QuotationItem["keputusan"], extra: Partial<QuotationItem> = {}): QuotationItem {
  return {
    id,
    quotation_id: "q1",
    urutan: 1,
    dari: `Asal ${id}`,
    tujuan: `Tujuan ${id}`,
    qty: 1,
    satuan: "Unit",
    nama_alat: `Alat ${id}`,
    harga_satuan: 5_000_000,
    subtotal: 5_000_000,
    keputusan,
    harga_revisi: null,
    harga_final: 5_000_000,
    subtotal_final: 5_000_000,
    jumlah_job: 0,
    ...extra
  };
}

const Q = {
  id: "q1",
  quote_number: "0001/SK/MAS/IX/2026",
  customer_id: "c1",
  pic_nama: "Budi",
  ppn_aktif: false,
  items: [
    item("a", "deal", { harga_revisi: 4_500_000, harga_final: 4_500_000, subtotal_final: 4_500_000 }),
    item("b", "ditolak"),
    item("c", "deal")
  ]
} as unknown as Quotation;

describe("job dari item penawaran", () => {
  it("hanya item deal yang bisa dipilih", () => {
    expect(pilihItemDeal(Q, "a")?.id).toBe("a");
    expect(pilihItemDeal(Q, "b")).toBeNull(); // ditolak
    expect(pilihItemDeal(Q, null)).toBeNull(); // dua item deal → wajib pilih
  });

  it("prefill memakai rute & harga revisi item itu, harga awal tetap tercatat", () => {
    const p = buildPrefill(Q, Q.items[0], null);
    expect(p.quotation_item_id).toBe("a");
    expect(p.asal).toBe("Asal a");
    expect(p.tujuan).toBe("Tujuan a");
    expect(p.catatan).toMatch(/@ Rp\s4\.500\.000/);
    expect(p.catatan).toMatch(/harga awal Rp\s5\.000\.000/);
  });
});

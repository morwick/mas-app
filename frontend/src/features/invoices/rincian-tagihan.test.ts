import { describe, expect, it } from "vitest";
import type { InvoiceItem } from "@/types";
import { susunRincian, totalUangJalan } from "./rincian-tagihan";

function item(id: string, patch: Partial<InvoiceItem>): InvoiceItem {
  return {
    id,
    invoice_id: "inv",
    urutan: 0,
    deskripsi: "x",
    qty: 1,
    satuan: "Unit",
    harga_satuan: 0,
    subtotal: 0,
    ...patch
  };
}

describe("susunRincian", () => {
  it("job proyek masuk ke baris proyeknya, baris lain sesudahnya", () => {
    const rincian = susunRincian({
      proyek: [
        { id: "bp1", invoice_id: "inv", proyek_id: "p1", proyek_nomor: "001/PRJ", urutan: 1, uraian: "Angkut", nominal: 1000 }
      ],
      items: [
        item("a", { job_id: "j1", proyek_id: "p1" }),
        item("b", { job_id: "j2", proyek_id: "p1" }),
        item("c", { deskripsi: "Biaya lain" })
      ]
    });
    expect(rincian.map((b) => b.jenis)).toEqual(["proyek", "item"]);
    expect(rincian[0].jenis === "proyek" && rincian[0].jobs.map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("tagihan lama tanpa baris proyek tampil per item", () => {
    const rincian = susunRincian({ items: [item("a", { job_id: "j1", proyek_id: "p1" })] });
    expect(rincian).toHaveLength(1);
    expect(rincian[0].jenis).toBe("item");
  });
});

describe("totalUangJalan", () => {
  it("menjumlahkan uang jalan cair & total", () => {
    expect(
      totalUangJalan([
        { uang_jalan_cair: 100, uang_jalan_total: 150 },
        { uang_jalan_cair: null, uang_jalan_total: 50 }
      ])
    ).toEqual({ cair: 100, total: 200 });
  });
});

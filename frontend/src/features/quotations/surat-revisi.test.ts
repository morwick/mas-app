import { describe, expect, it } from "vitest";
import type { Quotation, QuotationItem } from "@/types";
import { adaRevisi, suratAsli, suratRevisi, tanggalRevisiAwal } from "./surat-revisi";

const item = (id: string, o: Partial<QuotationItem>) =>
  ({
    id,
    qty: 1,
    harga_satuan: 7_500_000,
    subtotal: 7_500_000,
    harga_revisi: null,
    harga_final: 7_500_000,
    subtotal_final: 7_500_000,
    keputusan: "deal",
    diputuskan_at: null,
    ...o
  }) as QuotationItem;

const q = {
  quote_number: "0840/SK/MAS/IX/2026",
  tanggal: "2026-09-01",
  berlaku_sampai: "2026-09-15",
  perihal: "Surat Penawaran Pengangkutan Alat",
  ppn_aktif: true,
  ppn_persen: 11,
  items: [
    // Direvisi 7,5 jt → 7 jt, diputuskan 1 Okt 01.00 WIB (30 Sep 18.00 UTC).
    item("a", {
      harga_revisi: 7_000_000,
      harga_final: 7_000_000,
      subtotal_final: 7_000_000,
      diputuskan_at: "2026-09-30T18:00:00Z"
    }),
    item("b", { keputusan: "menunggu", harga_satuan: 1_000_000, subtotal: 1_000_000, harga_final: 1_000_000, subtotal_final: 1_000_000 }),
    item("c", { keputusan: "ditolak" })
  ]
} as unknown as Quotation;

describe("surat penawaran versi revisi", () => {
  it("nomor sama, harga revisi, item ditolak tidak ikut, PPN dihitung ulang", () => {
    const r = suratRevisi(q);
    expect(r.quote_number).toBe("0840/SK/MAS/IX/2026");
    expect(r.items.map((it) => [it.id, it.harga_satuan, it.subtotal])).toEqual([
      ["a", 7_000_000, 7_000_000],
      ["b", 1_000_000, 1_000_000]
    ]);
    expect([r.subtotal, r.ppn_nominal, r.total]).toEqual([8_000_000, 880_000, 8_880_000]);
    // Tanggal revisi terakhir, dalam WIB.
    expect(r.tanggal).toBe("2026-10-01");
    expect(r.perihal).toBe("Surat Penawaran Pengangkutan Alat (Revisi)");
  });

  it("tanpa PPN tidak menambah PPN", () => {
    const r = suratRevisi({ ...q, ppn_aktif: false });
    expect([r.ppn_nominal, r.total]).toEqual([0, 8_000_000]);
  });

  it("tombol hanya bila ada harga yang direvisi", () => {
    expect(adaRevisi(q)).toBe(true);
    expect(adaRevisi({ items: [item("x", {})] })).toBe(false);
  });

  it("sudah pernah dicetak: tanggal revisi tersimpan; versi asli tetap masa berlaku asli", () => {
    const tersimpan = { ...q, tanggal_revisi: "2026-10-05", berlaku_sampai: "2026-10-20", berlaku_sampai_asli: "2026-09-15" };
    const r = suratRevisi(tersimpan);
    expect([r.tanggal, r.berlaku_sampai, r.quote_number]).toEqual(["2026-10-05", "2026-10-20", "0840/SK/MAS/IX/2026"]);
    const a = suratAsli(tersimpan);
    expect([a.tanggal, a.berlaku_sampai, a.perihal]).toEqual(["2026-09-01", "2026-09-15", q.perihal]);
    // Dialog dibuka lagi → isian = yang tersimpan.
    expect(tanggalRevisiAwal(tersimpan)).toEqual({ tanggal: "2026-10-05", berlakuSampai: "2026-10-20" });
  });

  it("isian awal dialog: tanggal revisi terakhir + masa berlaku surat asli (14 hari)", () => {
    expect(tanggalRevisiAwal(q)).toEqual({ tanggal: "2026-10-01", berlakuSampai: "2026-10-15" });
  });
});

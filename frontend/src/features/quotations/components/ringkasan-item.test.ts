/** Ringkasan item di bawah nama customer pada daftar penawaran. */

import { describe, expect, it } from "vitest";
import type { QuotationListRow } from "@/types";
import { ringkasanItem } from "./quotations-list-view";

function baris(ubah: Partial<QuotationListRow>): QuotationListRow {
  return {
    status: "terkirim",
    jumlah_item: 3,
    jumlah_item_deal: 0,
    jumlah_item_ditolak: 0,
    jumlah_item_menunggu: 3,
    ...ubah
  } as QuotationListRow;
}

const teks = (row: QuotationListRow) => ringkasanItem(row).map((b) => b.teks).join(" · ");

describe("ringkasanItem", () => {
  it("draft → perlu dikirim", () => {
    expect(teks(baris({ status: "draft" }))).toBe("3 item perlu dikirim");
  });

  it("terkirim tanpa keputusan → perlu follow up", () => {
    expect(teks(baris({}))).toBe("3 item perlu follow up");
  });

  it("sebagian sudah diputuskan → hasil + sisa yang perlu follow up", () => {
    expect(teks(baris({ jumlah_item_deal: 1, jumlah_item_menunggu: 2 }))).toBe("1 deal · 2 perlu follow up");
  });

  it("semua diputuskan → deal & ditolak", () => {
    expect(
      teks(baris({ status: "deal", jumlah_item_deal: 2, jumlah_item_ditolak: 1, jumlah_item_menunggu: 0 }))
    ).toBe("2 deal · 1 ditolak");
    expect(teks(baris({ status: "ditolak", jumlah_item_ditolak: 3, jumlah_item_menunggu: 0 }))).toBe("3 ditolak");
  });

  it("kedaluwarsa → sisa item ditandai kedaluwarsa, bukan follow up", () => {
    expect(teks(baris({ status: "kedaluwarsa" }))).toBe("3 item kedaluwarsa");
    expect(teks(baris({ status: "kedaluwarsa", jumlah_item_deal: 1, jumlah_item_menunggu: 2 }))).toBe(
      "1 deal · 2 kedaluwarsa"
    );
  });
});

/** Piutang: tagihan draft & terkirim yang belum lunas (batal / lunas tidak). */

import { describe, expect, it } from "vitest";
import type { InvoiceListRow } from "@/types";
import { tagihanPiutang } from "./PiutangPage";

const tagihan = (nomor: string, isi: Partial<InvoiceListRow>) =>
  ({ id: nomor, invoice_number: nomor, status: "terkirim", sisa: 100, jatuh_tempo: null, ...isi }) as InvoiceListRow;

describe("tagihanPiutang", () => {
  it("draft ikut dihitung; batal, lunas, dan yang sisanya 0 tidak", () => {
    const hasil = tagihanPiutang([
      tagihan("DRAFT", { status: "draft" }),
      tagihan("TERKIRIM", { status: "terkirim" }),
      tagihan("BATAL", { status: "batal" }),
      tagihan("LUNAS", { status: "lunas", sisa: 0 }),
      tagihan("TERKIRIM-0", { status: "terkirim", sisa: 0 })
    ]).map((r) => r.invoice_number);
    expect(hasil.sort()).toEqual(["DRAFT", "TERKIRIM"]);
  });

  it("urut jatuh tempo paling lama dulu; tanpa jatuh tempo di akhir", () => {
    const hasil = tagihanPiutang([
      tagihan("C", { jatuh_tempo: null }),
      tagihan("B", { jatuh_tempo: "2026-10-31" }),
      tagihan("A", { status: "draft", jatuh_tempo: "2026-08-31" })
    ]).map((r) => r.invoice_number);
    expect(hasil).toEqual(["A", "B", "C"]);
  });
});

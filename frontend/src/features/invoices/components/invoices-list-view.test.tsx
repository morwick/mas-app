/**
 * Daftar tagihan: filter bulan & tahun tanggal tagihan dari URL (dibuka dari
 * angka omset Laba tahunan). Skenario sukses, edge (tanpa filter), dan batal.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { InvoiceListRow } from "@/types";
import { formatRupiah } from "@/lib/utils";
import { InvoicesListView } from "./invoices-list-view";

function tagihan(nomor: string, tanggal: string, isi: Partial<InvoiceListRow> = {}): InvoiceListRow {
  return {
    id: nomor,
    invoice_number: nomor,
    seq_no: 1,
    seq_tahun: 2026,
    customer_id: "c1",
    customer_nama: "PT Uji",
    kota_terbit: "Pekanbaru",
    tanggal,
    ppn_aktif: true,
    ppn_persen: 11,
    subtotal: 1_000_000,
    ppn_nominal: 110_000,
    total: 1_110_000,
    dibayar: 0,
    sisa: 1_110_000,
    status: "terkirim",
    status_tampil: "terkirim",
    status_bayar: "unpaid",
    jumlah_item: 1,
    proyek_nomor: [],
    ...isi
  } as InvoiceListRow;
}

const DATA = [
  tagihan("INV/001", "2026-01-10"),
  tagihan("INV/002", "2026-01-25", { subtotal: 500_000, status: "batal", status_tampil: "batal" }),
  tagihan("INV/003", "2026-02-03"),
  tagihan("INV/004", "2025-01-15")
];

const tampil = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <InvoicesListView invoices={DATA} />
    </MemoryRouter>
  );

const rapi = (s: string) => s.replace(/\s/g, " ");

describe("InvoicesListView filter periode", () => {
  it("sukses: ?bulan=1&tahun=2026 hanya menampilkan tagihan Januari 2026", () => {
    tampil("/invoices?tab=tagihan&status=all&bulan=1&tahun=2026");
    expect(screen.getAllByText("INV/001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INV/002").length).toBeGreaterThan(0);
    expect(screen.queryByText("INV/003")).toBeNull();
    expect(screen.queryByText("INV/004")).toBeNull();
    expect((screen.getByLabelText("Filter bulan") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("Filter tahun") as HTMLSelectElement).value).toBe("2026");
  });

  it("sukses: kolom Sebelum PPN & PPh dan Total per baris, tanpa kolom Setelah PPN", () => {
    tampil("/invoices?bulan=2&tahun=2026");
    expect(screen.getByRole("columnheader", { name: "Sebelum PPN & PPh" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Setelah PPN" })).toBeNull();
    const baris = screen.getAllByText("INV/003")[0].closest("tr")!;
    const teks = rapi(baris.textContent ?? "");
    expect(teks).toContain(rapi(formatRupiah(1_000_000)));
    expect(teks).toContain(rapi(formatRupiah(1_110_000)));
    expect(screen.queryByText("Total sebelum PPN")).toBeNull();
  });

  it("edge: tanpa filter periode → semua tagihan aktif tampil", () => {
    tampil("/invoices");
    for (const n of ["INV/001", "INV/003", "INV/004"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
  });

  it("sukses: status=aktif (dari Laba tahunan) menyembunyikan tagihan batal", () => {
    tampil("/invoices?tab=tagihan&status=aktif&bulan=1&tahun=2026");
    expect(screen.getAllByText("INV/001").length).toBeGreaterThan(0);
    expect(screen.queryByText("INV/002")).toBeNull();
    expect(screen.getByRole("button", { name: /^Aktif/ }).className).toContain("active");
  });

  it("edge: tanpa status → default Aktif (tagihan batal disembunyikan)", () => {
    tampil("/invoices?bulan=1&tahun=2026");
    expect(screen.queryByText("INV/002")).toBeNull();
    expect(screen.getByRole("button", { name: /^Aktif/ }).className).toContain("active");
  });

  it("sukses: status=all (Semua) menampilkan tagihan batal juga", () => {
    tampil("/invoices?status=all&bulan=1&tahun=2026");
    expect(screen.getAllByText("INV/002").length).toBeGreaterThan(0);
  });

  it("sukses: tagihan dengan PPh 23 — kolom Total = subtotal + PPN − PPh 23", () => {
    const data = [
      tagihan("INV/009", "2026-03-01", {
        ppn_nominal: 110_000,
        pph23_aktif: true,
        pph23_nominal: 20_000,
        total: 1_090_000,
        sisa: 1_090_000
      })
    ];
    render(
      <MemoryRouter initialEntries={["/invoices"]}>
        <InvoicesListView invoices={data} />
      </MemoryRouter>
    );
    const sel = Array.from(screen.getAllByText("INV/009")[0].closest("tr")!.querySelectorAll("td")).map((td) =>
      rapi(td.textContent ?? "")
    );
    // [ikon mata, nomor, customer, tanggal, jatuh tempo, sebelum PPN & PPh, total, sisa, ...]
    expect(sel[5]).toBe(rapi(formatRupiah(1_000_000)));
    expect(sel[6]).toBe(rapi(formatRupiah(1_090_000)));
  });

  it("sukses: baris total menjumlah Sebelum PPN & PPh, Total, dan Sisa tanpa tagihan batal", () => {
    // Semua Januari 2026: INV/001 aktif + INV/002 batal (tidak dijumlah).
    tampil("/invoices?status=all&bulan=1&tahun=2026");
    const sel = screen
      .getByText("Total", { selector: "tfoot span" })
      .closest("tr")!
      .querySelectorAll("td");
    const angka = Array.from(sel).map((td) => rapi(td.textContent ?? ""));
    expect(angka[1]).toBe(rapi(formatRupiah(1_000_000)));
    // Total = subtotal + PPN − PPh 23 (di data uji tanpa PPh 23).
    expect(angka[2]).toBe(rapi(formatRupiah(1_110_000)));
    expect(angka[3]).toBe(rapi(formatRupiah(1_110_000)));
    expect(angka[0]).toContain("2 tagihan ditampilkan");
  });

  it("gagal: bulan tidak valid diabaikan", () => {
    tampil("/invoices?bulan=13");
    expect((screen.getByLabelText("Filter bulan") as HTMLSelectElement).value).toBe("");
    expect(screen.getAllByText("INV/003").length).toBeGreaterThan(0);
  });
});

describe("tab Tagihan tanpa widget", () => {
  it("tidak ada kartu ringkasan (informasinya ada di halaman Piutang)", () => {
    tampil("/invoices");
    expect(screen.queryByText("Total tagihan")).toBeNull();
    expect(screen.queryByText("Belum dibayar")).toBeNull();
    expect(screen.queryByText(/Akan jatuh tempo/)).toBeNull();
  });
});

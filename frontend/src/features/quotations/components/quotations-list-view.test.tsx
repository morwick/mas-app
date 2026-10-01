/**
 * Daftar penawaran: filter bulan (default bulan ini) & tahun, dan kartu
 * monitoring (jumlah surat & item) yang mengikuti periode terpilih.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotationListRow } from "@/types";
import { QuotationsListView } from "./quotations-list-view";

interface Item {
  deal?: number;
  revisi?: number;
  nilaiDeal?: number;
  menunggu?: number;
  nilaiMenunggu?: number;
  ditolak?: number;
  nilaiDitolak?: number;
  /** Surat memakai PPN 11%. */
  ppn?: boolean;
}

const row = (id: string, tanggal: string, status: QuotationListRow["status"], subtotal: number, it: Item) =>
  ({
    id,
    quote_number: `${id}/SK/MAS`,
    customer_id: "c1",
    customer_nama: "PT Hexindo",
    tanggal,
    berlaku_sampai: null,
    status,
    subtotal,
    ppn_aktif: it.ppn ?? false,
    ppn_persen: 11,
    total: it.ppn ? subtotal + Math.round(subtotal * 0.11) : subtotal,
    jumlah_item: (it.deal ?? 0) + (it.menunggu ?? 0) + (it.ditolak ?? 0),
    jumlah_item_deal: it.deal ?? 0,
    jumlah_item_deal_revisi: it.revisi ?? 0,
    nilai_deal: it.nilaiDeal ?? 0,
    jumlah_item_menunggu: it.menunggu ?? 0,
    nilai_item_menunggu: it.nilaiMenunggu ?? 0,
    jumlah_item_ditolak: it.ditolak ?? 0,
    nilai_item_ditolak: it.nilaiDitolak ?? 0,
    jumlah_job: 0,
    jumlah_job_selesai: 0
  }) as unknown as QuotationListRow;

const DATA = [
  // 2 item deal (1 direvisi) + 1 item ditolak.
  row("0840", "2026-09-30", "completed", 18_000_000, {
    deal: 2, revisi: 1, nilaiDeal: 12_000_000, ditolak: 1, nilaiDitolak: 5_000_000, ppn: true
  }),
  // Masih terkirim: 1 item sudah deal, 2 item menunggu. Tanpa PPN.
  row("0839", "2026-09-10", "terkirim", 6_000_000, { deal: 1, nilaiDeal: 1_500_000, menunggu: 2, nilaiMenunggu: 4_000_000 }),
  // Kedaluwarsa: item yang belum diputuskan ikut dihitung tidak deal.
  row("0838", "2026-09-05", "kedaluwarsa", 1_000_000, { menunggu: 1, nilaiMenunggu: 1_000_000, ppn: true }),
  row("0700", "2026-08-20", "completed", 9_000_000, { deal: 1, nilaiDeal: 9_000_000 }),
  // Bulan lalu, terkirim, habis 3 Oktober (akan kedaluwarsa).
  { ...row("0701", "2026-08-25", "terkirim", 2_000_000, { menunggu: 1, nilaiMenunggu: 2_000_000 }), berlaku_sampai: "2026-10-03" },
  row("0001", "2025-12-01", "draft", 500_000, { menunggu: 1, nilaiMenunggu: 500_000 })
];

function renderView(props: Partial<Parameters<typeof QuotationsListView>[0]> = {}) {
  return render(
    <MemoryRouter>
      <QuotationsListView quotations={DATA} customers={[]} {...props} />
    </MemoryRouter>
  );
}

function kartu(label: RegExp) {
  return screen.getByText(label).closest("button") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T03:00:00Z")); // 30 Sep 2026, 10.00 WIB
});
afterEach(() => vi.useRealTimers());

describe("QuotationsListView — periode & kartu monitoring", () => {
  it("default bulan ini: hanya penawaran September 2026", () => {
    renderView();
    expect((screen.getByLabelText("Filter bulan") as HTMLSelectElement).value).toBe("09");
    expect((screen.getByLabelText("Filter tahun") as HTMLSelectElement).value).toBe("2026");
    expect(screen.getAllByText("0840/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0700/SK/MAS")).toBeNull();
  });

  it("kartu menampilkan jumlah surat dan item", () => {
    renderView();
    const total = kartu(/Total penawaran · September 2026/);
    expect(within(total).getByText("3 surat")).toBeTruthy();
    // Sama dengan jumlah kolom Nilai di tabel: 19,98 jt (PPN) + 6 jt (tanpa PPN) + 1,11 jt (PPN).
    expect(within(total).getByText(/^7 item · Rp\s?27\.090\.000$/)).toBeTruthy();

    // Deal dihitung per item, termasuk yang harganya direvisi.
    const deal = kartu(/Deal \(disetujui\)/);
    expect(within(deal).getByText("3 item")).toBeTruthy();
    // 12 jt + PPN (0840) + 1,5 jt tanpa PPN (0839).
    expect(within(deal).getByText(/^Rp\s?14\.820\.000 · 1 harga direvisi$/)).toBeTruthy();

    // Ditolak per item + item yang tidak sempat diputuskan saat kedaluwarsa.
    const tidak = kartu(/Ditolak \/ kedaluwarsa/);
    expect(within(tidak).getByText("2 item")).toBeTruthy();
    // (5 jt + 1 jt) + PPN — kedua suratnya ber-PPN.
    expect(within(tidak).getByText(/^Rp\s?6\.660\.000$/)).toBeTruthy();

    // Menunggu keputusan: hanya item menunggu di surat TERKIRIM (0839), bukan
    // yang kedaluwarsa (0838). 2 item · 4 jt tanpa PPN.
    const menunggu = kartu(/^Menunggu keputusan$/);
    expect(within(menunggu).getByText("2 item")).toBeTruthy();
    expect(within(menunggu).getByText(/^Rp\s?4\.000\.000$/)).toBeTruthy();
  });

  it("kartu Menunggu keputusan menampilkan nilai draft secara terpisah", () => {
    renderView({
      quotations: [...DATA, row("0841", "2026-09-29", "draft", 2_000_000, { menunggu: 2, nilaiMenunggu: 2_000_000, ppn: true })]
    });
    const menunggu = kartu(/^Menunggu keputusan$/);
    // Item tetap hanya dari surat terkirim; draft 2 jt + PPN 11% ditampilkan terpisah.
    expect(within(menunggu).getByText("2 item")).toBeTruthy();
    expect(within(menunggu).getByText(/^Rp\s?4\.000\.000 · \+ Rp\s?2\.220\.000 di draft$/)).toBeTruthy();
  });

  it("klik kartu Menunggu keputusan menyaring penawaran terkirim yang masih punya item menunggu", () => {
    renderView();
    fireEvent.click(kartu(/^Menunggu keputusan$/));
    expect(screen.getAllByText("0839/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0838/SK/MAS")).toBeNull();
    expect(screen.queryByText("0840/SK/MAS")).toBeNull();
  });

  it("klik kartu Deal menyaring penawaran yang punya item deal, walau masih terkirim", () => {
    renderView();
    fireEvent.click(kartu(/Deal \(disetujui\)/));
    expect(screen.getAllByText("0839/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0838/SK/MAS")).toBeNull();
  });

  it("klik kartu Ditolak / kedaluwarsa menyaring penawaran yang punya item tidak deal", () => {
    renderView();
    fireEvent.click(kartu(/Ditolak \/ kedaluwarsa/));
    expect(screen.getAllByText("0838/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0840/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0839/SK/MAS")).toBeNull();
  });

  it("tanpa kartu lama; chip Terkirim diberi label Butuh Follow up", () => {
    renderView();
    expect(screen.queryByText(/Menunggu respons/)).toBeNull();
    expect(screen.queryByText(/Akan kedaluwarsa \(/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Terkirim \(Butuh Follow up\)/ }));
    expect(screen.getAllByText("0839/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0840/SK/MAS")).toBeNull();
  });

  it("chip Ditolak = surat yang punya item ditolak, walau item lain deal", () => {
    renderView();
    // 0840: 2 item deal + 1 item ditolak → status surat completed, tetap muncul.
    fireEvent.click(screen.getByRole("button", { name: /^Ditolak\s*\d/ }));
    expect(screen.getAllByText("0840/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0839/SK/MAS")).toBeNull();
  });

  it("chip Deal = surat yang punya item deal, termasuk yang masih terkirim", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Deal\s*\d/ }));
    expect(screen.getAllByText("0840/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0839/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0838/SK/MAS")).toBeNull();
  });

  it("tidak ada chip Completed", () => {
    renderView();
    expect(screen.queryByRole("button", { name: /^Completed/ })).toBeNull();
  });

  it("alamat lama ?filter=ditolak diarahkan ke filter item ditolak", () => {
    renderView({ initialFilter: "ditolak" });
    expect(screen.getAllByText("0840/SK/MAS").length).toBeGreaterThan(0);
    expect(screen.queryByText("0700/SK/MAS")).toBeNull();
  });

  it("Semua bulan → setahun penuh; Semua tahun → seluruh data", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Filter bulan"), { target: { value: "" } });
    expect(within(kartu(/Total penawaran · tahun 2026/)).getByText("5 surat")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter tahun"), { target: { value: "" } });
    expect(within(kartu(/Total penawaran · semua periode/)).getByText("6 surat")).toBeTruthy();
    expect((screen.getByLabelText("Filter bulan") as HTMLSelectElement).disabled).toBe(true);
  });

  it("dibuka dari tautan (filter dashboard) → semua periode", () => {
    renderView({ initialFilter: "deal" });
    expect((screen.getByLabelText("Filter tahun") as HTMLSelectElement).value).toBe("");
    expect(screen.getAllByText("0700/SK/MAS").length).toBeGreaterThan(0);
  });
});

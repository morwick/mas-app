/**
 * Laba tahunan: baris total, margin, dan info proyek selesai belum ditagih.
 * Skenario sukses, edge (bulan kosong / tanpa proyek belum ditagih), dan rugi.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { LabaBulanRow, LabaTahunan } from "@/types";
import { formatRupiah } from "@/lib/utils";
import { LabaTahunanView } from "./laba-tahunan-view";

function bulan(b: number, isi: Partial<LabaBulanRow> = {}): LabaBulanRow {
  return {
    bulan: b,
    jumlah_tagihan: 0,
    jumlah_proyek: 0,
    omset: 0,
    dibayar: 0,
    uang_jalan: 0,
    biaya_lainnya: 0,
    jumlah_kosongan: 0,
    uang_jalan_kosongan: 0,
    biaya_lainnya_kosongan: 0,
    profit: 0,
    margin: null,
    ...isi
  };
}

function data(isi: Partial<LabaTahunan> = {}): LabaTahunan {
  return {
    tahun: 2026,
    bulan: Array.from({ length: 12 }, (_, i) => bulan(i + 1)),
    belum_ditagih: { jumlah: 0, uang_jalan: 0, biaya_lainnya: 0, daftar: [] },
    ...isi
  };
}

const tampil = (d: LabaTahunan) =>
  render(
    <MemoryRouter>
      <LabaTahunanView data={d} pilihanTahun={[2026, 2025]} />
    </MemoryRouter>
  );

/** Nilai teks tanpa spasi khusus Intl (nbsp) supaya mudah dibandingkan. */
const rapi = (s: string | null) => (s ?? "").replace(/\s/g, " ");

describe("LabaTahunanView", () => {
  it("sukses: baris total menjumlah semua bulan dan margin dari total", () => {
    const d = data();
    d.bulan[0] = bulan(1, { jumlah_tagihan: 1, omset: 1_000_000, dibayar: 500_000, uang_jalan: 250_000, biaya_lainnya: 50_000, profit: 700_000, margin: 70 });
    d.bulan[2] = bulan(3, { jumlah_tagihan: 2, omset: 1_000_000, uang_jalan: 400_000, profit: 600_000, margin: 60 });
    tampil(d);

    const baris = screen.getByText("Total").closest("tr")!;
    const sel = within(baris).getAllByRole("cell").map((c) => rapi(c.textContent));
    expect(sel[1]).toBe("3");
    expect(sel[2]).toBe(rapi(formatRupiah(2_000_000)));
    expect(sel[4]).toBe(rapi(formatRupiah(50_000)));
    expect(sel[5]).toBe(rapi(formatRupiah(1_300_000)));
    expect(sel[6]).toBe("65%");
    // Belum dibayar = omset − sudah dibayar.
    expect(sel[8]).toBe(rapi(formatRupiah(1_500_000)));
  });

  it("edge: tanpa proyek belum ditagih → info tidak tampil", () => {
    tampil(data());
    expect(screen.queryByText(/belum ditagih/)).toBeNull();
  });

  it("sukses: proyek selesai belum ditagih tampil dengan biayanya", () => {
    tampil(
      data({
        belum_ditagih: {
          jumlah: 1,
          uang_jalan: 300_000,
          biaya_lainnya: 15_000,
          daftar: [
            {
              proyek_id: "p1",
              nomor_proyek: "PRJ-001",
              customer_nama: "PT Uji",
              unit_kode: "U-1",
              etd_awal: "2026-01-05T00:00:00+07:00",
              jumlah_job: 2,
              uang_jalan: 300_000,
              biaya_lainnya: 15_000
            }
          ]
        }
      })
    );
    expect(screen.getByText("1 proyek sudah selesai tapi belum ditagih")).toBeTruthy();
    // Daftar tertutup dulu; dibuka lewat tombol.
    expect(screen.queryByText("PRJ-001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lihat daftar proyek" }));
    // Baris dibuka dengan klik 2 kali (nomor proyek bukan tautan lagi).
    expect(screen.getByText("PRJ-001").closest("tr")!.className).toContain("row-link");
  });

  it("sukses: bulan hanya berisi proyek kosongan tetap tampil biayanya", () => {
    const d = data();
    d.bulan[9] = bulan(10, {
      jumlah_kosongan: 1,
      uang_jalan: 400_000,
      uang_jalan_kosongan: 400_000,
      biaya_lainnya: 60_000,
      biaya_lainnya_kosongan: 60_000,
      profit: -460_000
    });
    tampil(d);
    const baris = screen.getByRole("cell", { name: "Oktober" }).closest("tr")!;
    expect(within(baris).getByText(rapi(formatRupiah(-460_000)), { normalizer: rapi })).toBeTruthy();
    expect(within(baris).getByText(rapi(`termasuk kosongan ${formatRupiah(400_000)}`), { normalizer: rapi })).toBeTruthy();
  });

  it("posisi: info belum ditagih tampil sebelum grafik & tabel bulanan", () => {
    tampil(
      data({
        belum_ditagih: { jumlah: 2, uang_jalan: 500_000, biaya_lainnya: 0, daftar: [] }
      })
    );
    const info = screen.getByText("2 proyek sudah selesai tapi belum ditagih");
    const grafik = screen.getByText("Omset vs biaya per bulan");
    // DOCUMENT_POSITION_FOLLOWING: grafik berada setelah info.
    expect(info.compareDocumentPosition(grafik) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sukses: angka omset & jumlah tagihan membuka daftar tagihan bulan itu", () => {
    const d = data();
    d.bulan[2] = bulan(3, { jumlah_tagihan: 2, omset: 1_000_000, profit: 1_000_000, margin: 100 });
    tampil(d);
    const baris = screen.getByRole("cell", { name: "Maret" }).closest("tr")!;
    const tautan = within(baris).getAllByRole("link");
    expect(tautan.map((a) => a.getAttribute("href"))).toEqual([
      "/invoices?tab=tagihan&status=aktif&bulan=3&tahun=2026",
      "/invoices?tab=tagihan&status=aktif&bulan=3&tahun=2026"
    ]);
    // Dibuka di tab baru supaya laporan tetap terbuka.
    expect(tautan.every((a) => a.getAttribute("target") === "_blank")).toBe(true);
    // Bulan tanpa tagihan tidak punya tautan.
    expect(within(screen.getByRole("cell", { name: "April" }).closest("tr")!).queryByRole("link")).toBeNull();
  });

  it("kartu Profit ukurannya sama dengan kartu lain; kartu Margin hijau bila plus, merah bila minus", () => {
    const d = data();
    d.bulan[0] = bulan(1, { jumlah_tagihan: 1, omset: 1_000_000, profit: 400_000, margin: 40 });
    const { unmount } = tampil(d);
    const nilai = (label: string) =>
      screen.getByText(label, { selector: ".eyebrow" }).nextElementSibling as HTMLElement;
    expect(nilai("Profit").style.fontSize).toBe(nilai("Omset").style.fontSize);
    expect(nilai("Margin").getAttribute("style")).toContain("var(--status-selesai-text)");
    unmount();

    const rugi = data();
    rugi.bulan[0] = bulan(1, { jumlah_tagihan: 1, omset: 100_000, uang_jalan: 150_000, profit: -50_000, margin: -50 });
    tampil(rugi);
    expect(nilai("Margin").getAttribute("style")).toContain("rgb(193, 56, 56)");
  });

  it("kartu Uang jalan & Biaya lainnya tampil positif (tanpa tanda minus)", () => {
    const d = data();
    d.bulan[0] = bulan(1, { jumlah_tagihan: 1, omset: 1_000_000, uang_jalan: 250_000, biaya_lainnya: 50_000 });
    tampil(d);
    const uj = screen.getByText("Uang jalan", { selector: ".eyebrow" }).parentElement!;
    const lain = screen.getByText("Biaya lainnya", { selector: ".eyebrow" }).parentElement!;
    expect(rapi(uj.textContent)).toContain(rapi(formatRupiah(250_000)));
    expect(rapi(lain.textContent)).toContain(rapi(formatRupiah(50_000)));
    expect(uj.textContent).not.toContain("-");
    expect(lain.textContent).not.toContain("-");
  });

  it("sukses: kartu tagihan sudah & belum dibayar dari total setahun", () => {
    const d = data();
    d.bulan[0] = bulan(1, { jumlah_tagihan: 1, omset: 1_000_000, dibayar: 400_000, profit: 1_000_000, margin: 100 });
    tampil(d);
    const sudah = screen.getByText("Tagihan sudah dibayar").parentElement!;
    const belum = screen.getByText("Tagihan belum dibayar").parentElement!;
    expect(rapi(sudah.textContent)).toContain(rapi(formatRupiah(400_000)));
    expect(sudah.textContent).toContain("40% dari omset");
    expect(rapi(belum.textContent)).toContain(rapi(formatRupiah(600_000)));
    expect(belum.textContent).toContain("60% dari omset");
  });

  it("gagal/rugi: profit negatif ditandai merah dan margin negatif", () => {
    const d = data();
    d.bulan[4] = bulan(5, { jumlah_tagihan: 1, omset: 100_000, uang_jalan: 150_000, profit: -50_000, margin: -50 });
    tampil(d);
    const baris = screen.getByRole("cell", { name: "Mei" }).closest("tr")!;
    const profit = within(baris).getByText(rapi(formatRupiah(-50_000)), { normalizer: rapi });
    expect(profit.getAttribute("style")).toContain("rgb(193, 56, 56)");
    // Margin tebal: minus merah.
    const margin = within(baris).getByText("-50%");
    expect(margin.getAttribute("style")).toContain("font-weight: 700");
    expect(margin.getAttribute("style")).toContain("rgb(193, 56, 56)");
  });

  it("margin plus tebal & hijau; angka minus lain (mis. uang jalan) merah", () => {
    const d = data();
    d.bulan[5] = bulan(6, { jumlah_tagihan: 1, omset: 1_000_000, uang_jalan: -20_000, profit: 1_020_000, margin: 102 });
    tampil(d);
    const baris = screen.getByRole("cell", { name: "Juni" }).closest("tr")!;
    const margin = within(baris).getByText("102%");
    expect(margin.getAttribute("style")).toContain("font-weight: 700");
    expect(margin.getAttribute("style")).toContain("var(--status-selesai-text)");
    const uangJalan = within(baris).getByText(rapi(formatRupiah(-20_000)), { normalizer: rapi });
    expect(uangJalan.getAttribute("style")).toContain("rgb(193, 56, 56)");
  });
});

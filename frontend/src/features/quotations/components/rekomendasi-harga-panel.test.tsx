/**
 * Panel rekomendasi harga di form penawaran: 4 sel (customer ini / semua ×
 * deal / menunggu), tombol "Pakai", dan tidak memanggil server sebelum rute
 * & jenis unit lengkap.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RekomendasiHarga } from "@/types";

const useRekomendasiHarga = vi.fn();
vi.mock("@/features/quotations/queries", () => ({
  useRekomendasiHarga: (p: unknown) => useRekomendasiHarga(p)
}));

import { RekomendasiHargaPanel } from "./rekomendasi-harga-panel";

function baris(ubah: Partial<RekomendasiHarga>): RekomendasiHarga {
  return {
    lingkup: "customer",
    kategori: "deal",
    quotation_id: "q1",
    quote_number: "0001/SK/MAS/IX/2026",
    customer_nama: "PT A",
    tanggal: "2026-09-01",
    berlaku_sampai: "2026-09-15",
    kedaluwarsa: false,
    diputuskan_at: "2026-09-03T02:00:00+00:00",
    harga: 9_500_000,
    harga_satuan: 10_000_000,
    harga_revisi: 9_500_000,
    nama_alat: "PC200",
    qty: 1,
    satuan: "Unit",
    ...ubah
  };
}

const PROPS = {
  dariKecamatanKode: "14.71.08",
  tujuanKecamatanKode: "14.06.01",
  jenisUnitId: "ju1",
  jenisUnitNama: "Lowbed",
  customerId: "c1"
};

describe("RekomendasiHargaPanel", () => {
  beforeEach(() => useRekomendasiHarga.mockReset());

  it("tidak tampil & tidak memanggil server sebelum rute dan jenis unit lengkap", () => {
    useRekomendasiHarga.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    const { container } = render(
      <RekomendasiHargaPanel {...PROPS} jenisUnitId="" onPakai={() => {}} />
    );
    expect(container.textContent).toBe("");
    expect(useRekomendasiHarga).toHaveBeenCalledWith(null);
  });

  it("menampilkan deal & penawaran terbaru, lalu tombol Pakai mengisi harga", () => {
    useRekomendasiHarga.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        baris({}),
        baris({
          kategori: "menunggu",
          quotation_id: "q2",
          quote_number: "0009/SK/MAS/IX/2026",
          harga: 13_000_000,
          harga_satuan: 13_000_000,
          harga_revisi: null,
          kedaluwarsa: true
        }),
        baris({ lingkup: "semua", customer_nama: "PT B", harga: 12_000_000, harga_revisi: null })
      ]
    });
    const onPakai = vi.fn();
    render(<RekomendasiHargaPanel {...PROPS} kecualiQuotationId="q-edit" onPakai={onPakai} />);

    expect(useRekomendasiHarga).toHaveBeenCalledWith({
      dariKecamatanKode: "14.71.08",
      tujuanKecamatanKode: "14.06.01",
      jenisUnitId: "ju1",
      customerId: "c1",
      kecualiQuotationId: "q-edit"
    });
    expect(screen.getByText(/Harga terakhir rute ini \(Lowbed\)/)).toBeTruthy();
    expect(screen.getByText(/revisi dari/)).toBeTruthy();
    expect(screen.getByText(/kedaluwarsa/)).toBeTruthy();
    // Sel tanpa data (penawaran terbaru · semua customer) → tanda strip.
    expect(screen.getByText("—")).toBeTruthy();
    const tautan = screen.getByText("0009/SK/MAS/IX/2026").closest("a")!;
    expect(tautan.getAttribute("href")).toBe("/quotations/q2");
    expect(tautan.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getAllByRole("button", { name: "Pakai" })[1]);
    expect(onPakai).toHaveBeenCalledWith(13_000_000);
  });

  it("memberi tahu bila belum ada riwayat untuk rute ini", () => {
    useRekomendasiHarga.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<RekomendasiHargaPanel {...PROPS} onPakai={() => {}} />);
    expect(screen.getByText(/Belum ada penawaran sebelumnya/)).toBeTruthy();
  });
});

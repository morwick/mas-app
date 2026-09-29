import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { PerintahKerjaForm } from "./perintah-kerja-form";

const polis = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("@/features/units/queries", () => ({
  useUnits: () => ({
    data: [{ id: "u1", kode_unit: "SL29", jenis_unit_nama: "Lowbed", no_polisi: "B 1", status: "standby" }],
    isLoading: false
  }),
  useUnitIncidents: () => ({ data: [] })
}));
vi.mock("@/features/unit-trailer/queries", () => ({
  useUnitTrailer: () => ({ data: { items: [] } }),
  useUnitTrailerIncidents: () => ({ data: [] })
}));
vi.mock("@/features/mekanik/api", () => ({ useMekanikList: () => ({ data: [], isLoading: false }) }));
vi.mock("@/features/bengkel/api", () => ({ useBengkelList: () => ({ data: [] }) }));
vi.mock("@/features/asuransi/queries", () => ({
  usePolisBerlaku: () => ({ data: polis.data, isSuccess: true }),
  useAsuransi: () => ({ data: undefined })
}));

function tampil() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <PerintahKerjaForm mode="new" awal={{ jenisAset: "unit", asetId: "u1" }} />
      </ToastProvider>
    </MemoryRouter>
  );
}

const tombolAsuransi = () => screen.getByRole("radio", { name: /Asuransi/ }) as HTMLButtonElement;

beforeEach(() => {
  polis.data = null;
});

describe("PerintahKerjaForm", () => {
  it("tanpa polis berlaku: pelaksana Asuransi tidak bisa dipilih", () => {
    tampil();
    expect(tombolAsuransi().disabled).toBe(true);
    expect(screen.getByText("Aset belum punya polis yang berlaku pada tanggal ini")).toBeTruthy();
  });

  it("dengan polis berlaku: Asuransi bisa dipilih dan isian klaim muncul", () => {
    polis.data = {
      id: "pol1",
      asuransi_id: "a1",
      asuransi_nama: "Asuransi Sinar",
      nomor_polis: "POL-001",
      berakhir: "2026-12-31",
      own_risk: 500000
    };
    tampil();
    expect(tombolAsuransi().disabled).toBe(false);
    fireEvent.click(tombolAsuransi());
    expect(screen.getByText("POL-001")).toBeTruthy();
    expect(screen.getByText("Nilai disetujui asuransi (Rp)")).toBeTruthy();
    expect(screen.getByText("Ditanggung perusahaan")).toBeTruthy();
  });

  it("ringkasan biaya menjumlahkan sparepart (qty × harga)", () => {
    tampil();
    fireEvent.click(screen.getByText("Tambah sparepart"));
    const qty = screen.getAllByRole("textbox").find((el) => (el as HTMLInputElement).value === "1")!;
    // Baris sparepart: kode, nama, qty, satuan, harga satuan.
    const [, nama, , , harga] = Array.from(qty.closest(".grid")!.querySelectorAll("input"));
    fireEvent.change(nama, { target: { value: "Oli" } });
    fireEvent.change(qty, { target: { value: "4" } });
    fireEvent.change(harga, { target: { value: "75000" } });
    expect(screen.getAllByText("Rp 300.000").length).toBeGreaterThan(0);
  });
});

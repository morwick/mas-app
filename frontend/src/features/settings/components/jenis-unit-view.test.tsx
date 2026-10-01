/** Menu Jenis Unit: tab Jenis Unit & tab Jenis Unit Trailer dalam satu halaman. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JenisUnit } from "@/types";
import type { JenisUnitTrailer } from "@/features/unit-trailer/api";

const createJenisUnitTrailer = vi.fn();
const updateJenisUnitTrailer = vi.fn();
const deleteJenisUnitTrailer = vi.fn();
vi.mock("@/features/unit-trailer/api", () => ({
  createJenisUnitTrailer: (...a: unknown[]) => createJenisUnitTrailer(...a),
  updateJenisUnitTrailer: (...a: unknown[]) => updateJenisUnitTrailer(...a),
  deleteJenisUnitTrailer: (...a: unknown[]) => deleteJenisUnitTrailer(...a)
}));
vi.mock("@/features/settings/api", () => ({
  createJenisUnit: vi.fn(),
  updateJenisUnit: vi.fn(),
  deleteJenisUnit: vi.fn()
}));
const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError })
}));

import { JenisUnitView } from "./jenis-unit-view";

const JENIS: JenisUnit[] = [
  { id: "ju1", nama: "Lowbed", is_active: true },
  { id: "ju2", nama: "Self Loader", is_active: true }
];
const TRAILER: JenisUnitTrailer[] = [
  { id: "t1", nama: "Lowbed 3 as", jenis_unit_id: "ju1", jenis_unit_nama: "Lowbed" },
  { id: "t2", nama: "Lowbed 4 as", jenis_unit_id: "ju1", jenis_unit_nama: "Lowbed" },
  { id: "t3", nama: "Dolly", jenis_unit_id: "ju2", jenis_unit_nama: "Self Loader" }
];

function bukaTabTrailer() {
  render(<JenisUnitView list={JENIS} trailer={TRAILER} />);
  fireEvent.click(screen.getByRole("button", { name: /Jenis Unit Trailer/ }));
}

describe("JenisUnitView", () => {
  beforeEach(() => {
    for (const f of [createJenisUnitTrailer, updateJenisUnitTrailer, deleteJenisUnitTrailer]) {
      f.mockReset().mockResolvedValue({ ok: true, data: null });
    }
    toastError.mockReset();
  });

  it("tab Jenis Unit: daftar jenis unit + jumlah jenis trailernya, tanpa nama trailer", () => {
    render(<JenisUnitView list={JENIS} trailer={TRAILER} />);
    expect(screen.getByText("Lowbed")).toBeTruthy();
    expect(screen.getByText("2 jenis trailer")).toBeTruthy();
    expect(screen.queryByText("Lowbed 3 as")).toBeNull();
  });

  it("tab Jenis Unit Trailer: cari nama trailer atau nama jenis unitnya", () => {
    bukaTabTrailer();
    expect(screen.getByText("Dolly")).toBeTruthy();
    const cari = screen.getByPlaceholderText("Cari jenis trailer atau jenis unit…");
    fireEvent.change(cari, { target: { value: "4 as" } });
    expect(screen.getByText("Lowbed 4 as")).toBeTruthy();
    expect(screen.queryByText("Lowbed 3 as")).toBeNull();
    fireEvent.change(cari, { target: { value: "self" } });
    expect(screen.getByText("Dolly")).toBeTruthy();
    expect(screen.queryByText("Lowbed 4 as")).toBeNull();
  });

  it("tambah jenis trailer: jenis unit wajib dipilih", async () => {
    bukaTabTrailer();
    fireEvent.click(screen.getByRole("button", { name: "Tambah jenis trailer" }));
    fireEvent.change(screen.getByPlaceholderText("Contoh: Lowbed 3 as"), { target: { value: " Flatbed " } });
    // Jenis unit wajib — belum dipilih → ditolak sebelum dikirim.
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(toastError).toHaveBeenCalledWith("Nama dan jenis unit wajib diisi.");
    expect(createJenisUnitTrailer).not.toHaveBeenCalled();
  });

  it("nama trailer kembar ditolak sebelum dikirim", () => {
    bukaTabTrailer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Dolly" }));
    fireEvent.change(screen.getByDisplayValue("Dolly"), { target: { value: "lowbed  3 AS" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(toastError).toHaveBeenCalledWith("Gagal! Jenis Unit Trailer dengan nama ini sudah ada");
    expect(updateJenisUnitTrailer).not.toHaveBeenCalled();
  });

  it("edit & hapus jenis trailer", async () => {
    bukaTabTrailer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lowbed 4 as" }));
    fireEvent.change(screen.getByDisplayValue("Lowbed 4 as"), { target: { value: "Lowbed 4 as Hidrolik" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateJenisUnitTrailer).toHaveBeenCalledWith("t2", "Lowbed 4 as Hidrolik", "ju1"));

    fireEvent.click(screen.getByRole("button", { name: "Hapus Lowbed 3 as" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(deleteJenisUnitTrailer).toHaveBeenCalledWith("t1"));
  });
});

/** Master Vendor: daftar mirip Customer, tanpa kolom jumlah penawaran / job. */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Vendor } from "@/types";
import { VendorsListView } from "./vendors-list-view";

const vendor = (isi: Partial<Vendor>): Vendor => ({
  id: "v1",
  nama_perusahaan: "PT Sumber Ban",
  alamat: "Jl. Riau",
  is_active: true,
  created_at: "2026-10-03T00:00:00Z",
  ...isi
});

const tampil = (vendors: Vendor[]) =>
  render(
    <MemoryRouter>
      <VendorsListView vendors={vendors} />
    </MemoryRouter>
  );

describe("VendorsListView", () => {
  it("menampilkan vendor; baris & ikon mata membuka halaman edit vendor", () => {
    tampil([vendor({}), vendor({ id: "v2", nama_perusahaan: "CV Oli Jaya", is_active: false })]);
    expect(screen.getAllByText("PT Sumber Ban").length).toBeGreaterThan(0);
    // Sama dengan Customer: filter default hanya vendor aktif.
    expect(screen.queryByText("CV Oli Jaya")).toBeNull();
    expect(screen.queryByText("Jumlah penawaran")).toBeNull();
    expect(screen.queryByText("Total job")).toBeNull();
    const lihat = screen.getAllByRole("link", { name: "Lihat detail" }).map((a) => a.getAttribute("href"));
    expect(lihat).toContain("/vendors/v1/edit");
  });

  it("kosong → ajakan menambah vendor", () => {
    tampil([]);
    expect(screen.getByText("Belum ada vendor")).toBeTruthy();
  });
});

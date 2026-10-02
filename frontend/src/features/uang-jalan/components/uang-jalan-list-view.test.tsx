/**
 * Menu Uang Jalan: kolom "Terakhir" tidak ada; kolom Pengajuan berisi badge
 * terpisah — "Cair N" (driver menunggu pencairan) & "Approval N" (tambahan
 * menunggu approval).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { UangJalanJobRow } from "@/types";
import { UangJalanListView } from "./uang-jalan-list-view";

function baris(id: string, pencairan: number, approval: number): UangJalanJobRow {
  return {
    job_id: id,
    job_number: `JOB-${id}`,
    status: "loading",
    asal: "Gudang A",
    tujuan: "Site B",
    etd: "2026-10-01T01:00:00Z",
    unit_kode: "TH06",
    driver_nama: "Budi",
    customer_nama: "PT A",
    ringkasan: { uang_jalan_awal: 1_000_000, tambahan: 0, uang_jalan: 1_000_000, cair: 0, sisa: 1_000_000, persen_cair: 0 },
    pencairan_terakhir: null,
    pengajuan_menunggu: pencairan,
    tambahan_menunggu_approval: approval
  } as unknown as UangJalanJobRow;
}

function tampil(rows: UangJalanJobRow[]) {
  render(
    <MemoryRouter>
      <UangJalanListView rows={rows} />
    </MemoryRouter>
  );
}

describe("tabel menu Uang Jalan", () => {
  it("tanpa kolom Terakhir", () => {
    tampil([baris("1", 0, 0)]);
    expect(screen.queryByText("Terakhir")).toBeNull();
  });

  it("badge terpisah: Cair (pengajuan driver) & Approval (tambahan menunggu approval)", () => {
    tampil([baris("1", 2, 1), baris("2", 0, 0)]);
    expect(screen.getByText("Cair 2").getAttribute("title")).toMatch(/menunggu dicairkan/);
    expect(screen.getByText("Approval 1").getAttribute("title")).toMatch(/menunggu approval/);
  });

  it("filter Menunggu approval hanya menampilkan job dengan tambahan menunggu approval", () => {
    tampil([baris("1", 1, 0), baris("2", 0, 2)]);
    const tombol = screen.getByRole("button", { name: /Menunggu approval/ });
    expect(tombol.textContent).toContain("1");
    fireEvent.click(tombol);
    expect(screen.queryByText("JOB-1")).toBeNull();
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
  });
});

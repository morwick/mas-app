/**
 * Tab "Proyek per unit": unit + proyek di bawahnya (urut tanggal muat dari
 * server), unit tanpa proyek tetap tampil, filter default bulan & tahun
 * berjalan + status Aktif.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulanTahunWIB } from "@/lib/utils";
import type { ProyekPerUnit } from "../api";

let items: ProyekPerUnit[] = [];
const useProyekPerUnit = vi.fn();
vi.mock("../queries", () => ({
  useProyekPerUnit: (f: unknown) => {
    useProyekPerUnit(f);
    return { data: { items, total: items.length, page: 1, page_size: 10 }, isPending: false, isError: false };
  }
}));

import { ProyekPerUnitView } from "./proyek-per-unit-view";

function tampil() {
  render(
    <MemoryRouter>
      <ProyekPerUnitView />
    </MemoryRouter>
  );
}

describe("ProyekPerUnitView", () => {
  beforeEach(() => {
    useProyekPerUnit.mockReset();
    items = [
      {
        unit_id: "u1",
        kode_unit: "TH06",
        no_polisi: "BM 9059 AO",
        jenis_unit_nama: "Tronton",
        jobs: [
          {
            job_id: "j1",
            job_number: "JOB-2026-001",
            proyek_id: "p1",
            nomor_proyek: "001/PRJ/MAS/X/2026",
            customer_nama: "PT Anugerah",
            asal: "Pelabuhan Dumai, Kota Dumai, Riau, Indonesia — Gudang Utama PT Anugerah Jaya Blok C",
            tujuan: "Dumai",
            etd: "2026-10-02T00:00:00Z",
            tanggal_muat: "2026-10-02T01:00:00Z",
            tanggal_bongkar: "2026-10-03T05:00:00Z",
            dibatalkan: false
          },
          {
            job_id: "j2",
            job_number: "JOB-2026-002",
            proyek_id: "p2",
            nomor_proyek: "002/PRJ/MAS/X/2026",
            customer_nama: null,
            tujuan: "Pekanbaru",
            etd: "2026-10-09T00:00:00Z",
            tanggal_muat: null,
            tanggal_bongkar: null,
            dibatalkan: false
          }
        ]
      }
    ];
  });

  it("tab Proyek per unit aktif; filter default bulan & tahun berjalan + status Aktif", () => {
    tampil();
    const { bulan, tahun } = bulanTahunWIB();
    expect(useProyekPerUnit).toHaveBeenCalledWith(expect.objectContaining({ bulan, tahun, statusProyek: "aktif", page: 1 }));
    expect(screen.getByText("Proyek per unit")).toBeTruthy();
  });

  it("unit sebagai kelompok; job di bawahnya: no. proyek, no. job, customer, rute, tanggal saja", () => {
    tampil();
    expect(screen.getAllByText("TH06").length).toBeGreaterThan(0);
    expect(screen.getAllByText("001/PRJ/MAS/X/2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-2026-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rute").length).toBeGreaterThan(0);
    // Asal panjang dipotong 50 karakter + "…" seperti kolom Rute di daftar Job.
    expect(screen.getAllByTitle(/Gudang Utama PT Anugerah Jaya Blok C/)[0].textContent).toMatch(/…$/);
    expect(screen.getAllByText("KOSONGAN").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Belum muat/).length).toBeGreaterThan(0);
    // Tanggal saja, tanpa jam.
    expect(screen.getAllByText("02 Okt 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText(/02 Okt 2026, \d/)).toBeNull();
  });

  it("pilih Semua status → filter status dikosongkan & kembali ke halaman 1", () => {
    tampil();
    fireEvent.click(screen.getByRole("button", { name: "Semua" }));
    expect(useProyekPerUnit).toHaveBeenLastCalledWith(expect.objectContaining({ statusProyek: "", page: 1 }));
  });
});

/** Detail driver: identitas, job aktif / riwayat job, dan dokumen SIM. */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Driver, Job } from "@/types";
import { DriverDetailView } from "./driver-detail-view";

let bolehKelola = true;
vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ canManageOperational: bolehKelola })
}));

const DRIVER: Driver = {
  id: "d1",
  nama: "Budi Santoso",
  karyawan_id: "k1",
  no_hp: "081234567890",
  no_sim: "SIM-777",
  sim_berlaku_sampai: "2099-01-31",
  sim_url: "https://x/sim.pdf",
  alamat: "Jl. Mawar 1",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  status: "in_job",
  active_job_id: "j1",
  active_job_number: "JOB-001"
};

const job = (id: string, status: string, nomor: string): Job =>
  ({
    id,
    job_number: nomor,
    status,
    alat_diangkut: `Excavator ${nomor}`,
    tujuan: "Bekasi, Jawa Barat",
    customer_nama: "PT Maju",
    etd: "2026-09-01T08:00:00+07:00",
    completed_at: null
  }) as unknown as Job;

const JOBS = [job("j1", "on_the_way", "JOB-001"), job("j2", "selesai", "JOB-002"), job("j3", "cancelled", "JOB-003")];

function tampil(driver: Driver = DRIVER, jobs: Job[] = JOBS) {
  render(
    <MemoryRouter>
      <DriverDetailView driver={driver} jobs={jobs} unitTetap={{ unit_id: "u1", kode_unit: "SL29" }} />
    </MemoryRouter>
  );
}

describe("DriverDetailView", () => {
  it("menampilkan identitas, unit tetap, dan tombol Edit", () => {
    bolehKelola = true;
    tampil();
    expect(screen.getByText("Budi Santoso")).toBeTruthy();
    expect(screen.getByText("In Job")).toBeTruthy();
    expect(screen.getByText("SL29").closest("a")?.getAttribute("href")).toBe("/units/u1");
    expect(screen.getByText("Edit").closest("a")?.getAttribute("href")).toBe("/drivers/d1/edit");
    expect(screen.getByText("Jl. Mawar 1")).toBeTruthy();
  });

  it("job aktif tampil lebih dulu; riwayat berisi job selesai & batal", () => {
    tampil();
    expect(screen.getByText("Excavator JOB-001")).toBeTruthy();
    fireEvent.click(screen.getByText("Riwayat job"));
    expect(screen.getByText("Excavator JOB-002")).toBeTruthy();
    expect(screen.getByText("Excavator JOB-003")).toBeTruthy();
    expect(screen.queryByText("Excavator JOB-001")).toBeNull();
  });

  it("dokumen SIM yang diunggah bisa dilihat", () => {
    tampil();
    const link = screen.getByText("Lihat dokumen").closest("a");
    expect(link?.getAttribute("href")).toBe("https://x/sim.pdf");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("tanpa job & dokumen: keadaan kosong, tanpa link dokumen", () => {
    tampil({ ...DRIVER, status: "stand_by", active_job_id: null, sim_url: null, no_sim: null, sim_berlaku_sampai: null }, []);
    expect(screen.getByText("Stand By")).toBeTruthy();
    expect(screen.getByText("Belum ada riwayat")).toBeTruthy();
    expect(screen.queryByText("Lihat dokumen")).toBeNull();
    expect(screen.getByText("Belum dicatat — isi lewat Edit driver")).toBeTruthy();
  });

  it("operator (tanpa hak kelola) tidak melihat tombol Edit", () => {
    bolehKelola = false;
    tampil();
    expect(screen.queryByText("Edit")).toBeNull();
    bolehKelola = true;
  });
  it("driver yang karyawannya di-blacklist menampilkan badge dan alasannya", () => {
    tampil({
      ...DRIVER,
      is_active: false,
      status: "stand_by",
      active_job_id: null,
      active_job_number: null,
      is_blacklist: true,
      blacklist_alasan: "Membawa kabur solar",
      blacklist_at: "2026-10-01T01:00:00Z",
      blacklist_oleh_nama: "Super Admin"
    });
    expect(screen.getByText("Blacklist")).toBeTruthy();
    expect(screen.getByText("Driver ini di-blacklist")).toBeTruthy();
    expect(screen.getByText(/Membawa kabur solar/)).toBeTruthy();
    expect(screen.getByText(/oleh Super Admin/)).toBeTruthy();
  });
});

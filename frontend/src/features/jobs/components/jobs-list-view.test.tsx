/**
 * Daftar job dibuka dari "Total job" di menu Customer: filter customer
 * terpasang dan tab "Semua" terpilih, jadi jumlahnya sama dengan angka itu.
 */
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Customer, Job } from "@/types";
import { JobsListView } from "./jobs-list-view";

vi.mock("@/lib/auth/AuthContext", () => ({
  useCurrentUser: () => ({ role: "admin" })
}));

function job(id: string, customerId: string, status: string): Job {
  return {
    id,
    job_number: `JOB-${id}`,
    share_token: "tok",
    customer_id: customerId,
    customer_nama: customerId === "c1" ? "PT Anugerah" : "PT Lain",
    alat_diangkut: "Excavator",
    asal: "Gudang A",
    tujuan: "Proyek B",
    unit_id: "u1",
    driver_id: "d1",
    etd: "2026-10-01T01:00:00Z",
    status,
    created_at: "2026-09-01T00:00:00Z",
    eta_is_estimated: false,
    photos: []
  } as unknown as Job;
}

const JOBS = [
  job("1", "c1", "ditugaskan"),
  job("2", "c1", "selesai"),
  job("3", "c1", "cancelled"),
  job("4", "c2", "ditugaskan")
];
const CUSTOMERS = [
  { id: "c1", nama_perusahaan: "PT Anugerah", is_active: true },
  { id: "c2", nama_perusahaan: "PT Lain", is_active: true }
] as unknown as Customer[];

function tampil(props: { initialCustomerId?: string }) {
  render(
    <MemoryRouter>
      <JobsListView jobs={JOBS} customers={CUSTOMERS} unitMap={{}} driverMap={{}} {...props} />
    </MemoryRouter>
  );
}

describe("daftar job", () => {
  it("dari Total job customer: tab Semua terpilih, semua job customer itu tampil", () => {
    tampil({ initialCustomerId: "c1" });
    expect(screen.getAllByText("JOB-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-3").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-4")).toBeNull();
    // Angka tab "Semua" = total job customer itu.
    const tabSemua = screen
      .getAllByText("Semua")
      .map((el) => el.closest("button"))
      .find((b): b is HTMLButtonElement => b !== null);
    expect(tabSemua?.textContent).toContain("3");
  });

  it("dibuka biasa dari menu Job: default tetap tab Aktif", () => {
    tampil({});
    expect(screen.getAllByText("JOB-1").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-2")).toBeNull();
  });
});

describe("tab dari tautan", () => {
  it("?tab=validasi (dari dashboard) langsung membuka tab Menunggu validasi", () => {
    const jobs = [job("5", "c1", "menunggu_validasi"), job("6", "c1", "ditugaskan")];
    render(
      <MemoryRouter>
        <JobsListView jobs={jobs} customers={CUSTOMERS} unitMap={{}} driverMap={{}} initialTab="validasi" />
      </MemoryRouter>
    );
    expect(screen.getAllByText("JOB-5").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-6")).toBeNull();
  });

  it("?tab=ditugaskan (job belum dikonfirmasi, dari dashboard) hanya menampilkan job ditugaskan", () => {
    const jobs = [job("7", "c1", "ditugaskan"), job("8", "c1", "diterima"), job("9", "c1", "ditugaskan")];
    render(
      <MemoryRouter>
        <JobsListView jobs={jobs} customers={CUSTOMERS} unitMap={{}} driverMap={{}} initialTab="ditugaskan" />
      </MemoryRouter>
    );
    expect(screen.getAllByText("JOB-7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-9").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-8")).toBeNull();
  });
});

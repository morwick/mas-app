/**
 * Daftar job dibuka dari "Total job" di menu Customer: filter customer
 * terpasang dan kelompok "Aktif" terpilih, jadi jumlahnya sama dengan angka
 * itu. Kelompok "Semua" tetap memuat job yang dibatalkan.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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
    // Bulan berjalan: daftar job default memfilter periode ETD bulan ini.
    etd: new Date().toISOString(),
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
  function tombolTab(label: string): HTMLButtonElement {
    const b = screen
      .getAllByText(label)
      .map((el) => el.closest("button"))
      .find((x): x is HTMLButtonElement => x !== null);
    if (!b) throw new Error(`tab ${label} tidak ada`);
    return b;
  }

  it("dari Total job customer: kelompok Aktif, job dibatalkan tidak tampil", () => {
    tampil({ initialCustomerId: "c1" });
    expect(screen.getAllByText("JOB-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-3")).toBeNull();
    expect(screen.queryByText("JOB-4")).toBeNull();
    // Angka "Aktif" = Total job customer itu; "Semua" tetap menghitung yang batal.
    expect(tombolTab("Aktif").textContent).toContain("2");
    expect(tombolTab("Semua").textContent).toContain("3");
  });

  it("kelompok Semua tetap menampilkan job dibatalkan", () => {
    tampil({ initialCustomerId: "c1" });
    fireEvent.click(tombolTab("Semua"));
    expect(screen.getAllByText("JOB-3").length).toBeGreaterThan(0);
  });

  it("dibuka biasa: default kelompok Aktif, filter status langsung tampil", () => {
    tampil({});
    for (const id of ["JOB-1", "JOB-2", "JOB-4"]) {
      expect(screen.getAllByText(id).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("JOB-3")).toBeNull();
    expect(tombolTab("Semua status")).toBeTruthy();
  });

  it("kelompok Semua: semua job tampil, filter tahap tidak muncul", () => {
    tampil({});
    fireEvent.click(tombolTab("Semua"));
    for (const id of ["JOB-1", "JOB-2", "JOB-3", "JOB-4"]) {
      expect(screen.getAllByText(id).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Semua status")).toBeNull();
    expect(screen.queryByText("Dalam proses")).toBeNull();
  });

  it("filter tahap di kelompok Aktif: Selesai hanya menampilkan job selesai", () => {
    tampil({});
    fireEvent.click(tombolTab("Selesai"));
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-1")).toBeNull();
    expect(screen.queryByText("JOB-3")).toBeNull();
  });

  it("kelompok Dibatalkan: filter tahap disembunyikan", () => {
    tampil({});
    fireEvent.click(tombolTab("Dibatalkan"));
    expect(screen.getAllByText("JOB-3").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-1")).toBeNull();
    expect(screen.queryByText("Menunggu validasi")).toBeNull();
  });

  it("pencarian juga mencocokkan nama driver", () => {
    render(
      <MemoryRouter>
        <JobsListView
          jobs={[job("1", "c1", "ditugaskan"), { ...job("2", "c1", "selesai"), driver_id: "d2" }]}
          customers={CUSTOMERS}
          unitMap={{}}
          driverMap={{ d1: "Budi Santoso", d2: "Agus Wijaya" }}
        />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText(/Cari job/), { target: { value: "agus" } });
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-1")).toBeNull();
  });

  it("default periode bulan ini: job ETD bulan lalu disembunyikan sampai filter bulan dikosongkan", () => {
    const lama = new Date();
    lama.setMonth(lama.getMonth() - 2);
    render(
      <MemoryRouter>
        <JobsListView
          jobs={[job("1", "c1", "ditugaskan"), { ...job("2", "c1", "ditugaskan"), etd: lama.toISOString() }]}
          customers={CUSTOMERS}
          unitMap={{}}
          driverMap={{}}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("JOB-1").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-2")).toBeNull();
  });

  it("dibuka lewat tautan (?tab=) tidak memfilter periode", () => {
    const lama = new Date();
    lama.setFullYear(lama.getFullYear() - 1);
    render(
      <MemoryRouter>
        <JobsListView
          jobs={[{ ...job("2", "c1", "ditugaskan"), etd: lama.toISOString() }]}
          customers={CUSTOMERS}
          unitMap={{}}
          driverMap={{}}
          initialTab="ditugaskan"
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("JOB-2").length).toBeGreaterThan(0);
  });

  it("rute lebih dari 50 karakter dipotong dengan …", () => {
    const panjang = "Jl. Raya Industri Kawasan Jababeka II Blok C No. 123, Cikarang, Bekasi";
    render(
      <MemoryRouter>
        <JobsListView
          jobs={[{ ...job("1", "c1", "ditugaskan"), asal: panjang }]}
          customers={CUSTOMERS}
          unitMap={{}}
          driverMap={{}}
        />
      </MemoryRouter>
    );
    const el = screen.getByTitle(panjang);
    expect(el.textContent).toBe(`${panjang.slice(0, 50).trimEnd()}…`);
  });
});

describe("halaman Job (menu tersendiri)", () => {
  it("berjudul Job tanpa tab Proyek, tanpa tombol Proyek baru; tombol Jadwal tetap ada", () => {
    tampil({});
    expect(screen.getByRole("heading", { name: "Job" })).toBeTruthy();
    expect(screen.queryByText("Proyek Detail (Job)")).toBeNull();
    expect(screen.queryByText("Proyek baru")).toBeNull();
    expect(screen.getByText("Jadwal")).toBeTruthy();
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
    const jobs = [
      job("7", "c1", "ditugaskan"),
      job("8", "c1", "diterima"),
      job("9", "c1", "ditugaskan"),
      job("10", "c1", "cancelled")
    ];
    render(
      <MemoryRouter>
        <JobsListView jobs={jobs} customers={CUSTOMERS} unitMap={{}} driverMap={{}} initialTab="ditugaskan" />
      </MemoryRouter>
    );
    expect(screen.getAllByText("JOB-7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JOB-9").length).toBeGreaterThan(0);
    expect(screen.queryByText("JOB-8")).toBeNull();
    expect(screen.queryByText("JOB-10")).toBeNull();
  });
});

/**
 * Halaman bagikan ke customer (setelah job dibuat): tombol "Lihat detail job"
 * dan "Kembali" (ke halaman proyek job ini); tombol "Buat job lagi" tidak ada.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { jejakDariProyek } from "@/components/layout/judul-halaman";
import { ToastProvider } from "@/components/ui/toast";
import type { Job } from "@/types";
import { JobConfirmationView } from "./job-confirmation-view";

const JOB = {
  id: "j1",
  job_number: "JOB-1",
  share_token: "tok",
  customer_nama: "PT A",
  alat_diangkut: "Excavator",
  asal: "A",
  tujuan: "B",
  etd: "2026-10-03T01:00:00Z",
  status: "ditugaskan",
  proyek_id: "p1"
} as Job;

/** Router dengan riwayat `entries`; halaman lain cukup menampilkan namanya. */
function tampil(entries: string[], job: Job = JOB) {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/jobs/:id/confirmation" element={<JobConfirmationView job={job} driverNama="Agus" driverNoHp="081200000001" />} />
          <Route path="/jobs/:id" element={<div>Halaman detail job</div>} />
          <Route path="/proyek/:id/tambah-job" element={<div>Halaman tambah job</div>} />
          <Route path="/proyek/:id" element={<div>Halaman proyek</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe("Halaman bagikan ke customer — tombol bawah", () => {
  it("sukses: Kembali → halaman proyek job ini (bukan halaman sebelumnya)", () => {
    tampil(["/proyek/p1/tambah-job", "/jobs/j1/confirmation"]);
    const kembali = screen.getByRole("link", { name: /Kembali/ });
    expect(kembali.getAttribute("href")).toBe("/proyek/p1");
    fireEvent.click(kembali);
    expect(screen.getByText("Halaman proyek")).toBeTruthy();
  });

  it("sukses: Lihat detail job → detail job", () => {
    tampil(["/proyek/p1/tambah-job", "/jobs/j1/confirmation"]);
    fireEvent.click(screen.getByRole("link", { name: /Lihat detail job/ }));
    expect(screen.getByText("Halaman detail job")).toBeTruthy();
  });

  it("edge: dibuka langsung tanpa riwayat → Kembali tetap ke halaman proyek", () => {
    tampil(["/jobs/j1/confirmation"]);
    fireEvent.click(screen.getByRole("link", { name: /Kembali/ }));
    expect(screen.getByText("Halaman proyek")).toBeTruthy();
  });

  it("edge: job tanpa proyek (data lama) → Kembali ke detail job", () => {
    tampil(["/jobs/j1/confirmation"], { ...JOB, proyek_id: null });
    fireEvent.click(screen.getByRole("link", { name: /Kembali/ }));
    expect(screen.getByText("Halaman detail job")).toBeTruthy();
  });

  it("gagal: tombol Buat job lagi sudah tidak ada", () => {
    tampil(["/jobs/j1/confirmation"]);
    expect(screen.queryByText(/Buat job lagi/)).toBeNull();
  });
});

describe("Halaman bagikan — asal proyek ikut ke detail job", () => {
  it("sukses: dibuka dari proyek → Lihat detail job membawa asal proyek", () => {
    function DetailJob() {
      const { state } = useLocation();
      return <div>asal: {JSON.stringify(state)}</div>;
    }
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[{ pathname: "/jobs/j1/confirmation", state: jejakDariProyek("p1") }]}>
          <Routes>
            <Route
              path="/jobs/:id/confirmation"
              element={<JobConfirmationView job={JOB} driverNama="Agus" driverNoHp="081200000001" />}
            />
            <Route path="/jobs/:id" element={<DetailJob />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("link", { name: /Lihat detail job/ }));
    expect(screen.getByText(/Detail Proyek/)).toBeTruthy();
    expect(screen.getByText(/\/proyek\/p1/)).toBeTruthy();
  });
});

/**
 * Detail proyek: tombol "Selesaikan job dengan unit lain" hanya di job lama (Selesai karena
 * ganti unit) yang SEMUA job penggantinya dibatalkan.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Job, ProyekDetail } from "@/types";

vi.mock("@/lib/auth/AuthContext", () => ({ useCurrentUser: () => ({ role: "admin" }) }));

import { ProyekDetailView } from "./proyek-detail-view";

function job(id: string, status: string, menggantikan?: string): Job {
  return {
    id,
    job_number: `JOB-${id}`,
    status,
    menggantikan_job_id: menggantikan ?? null,
    alat_diangkut: "Excavator",
    asal: "A",
    tujuan: "B",
    etd: "2026-10-01T01:00:00Z",
    unit_id: "u1",
    driver_id: "d1",
    customer_id: "c1"
  } as unknown as Job;
}

function proyek(jobs: Job[]): ProyekDetail {
  return {
    id: "p1",
    nomor_proyek: "001/PRJ/MAS/X/2026",
    customer_id: "c1",
    customer_nama: "PT A",
    created_at: "2026-10-01T00:00:00Z",
    jumlah_job: jobs.length,
    jumlah_job_selesai: 0,
    jumlah_job_batal: 0,
    jobs
  } as unknown as ProyekDetail;
}

function tampil(p: ProyekDetail, hanyaLihat = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProyekDetailView proyek={p} hanyaLihat={hanyaLihat} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("tombol Selesaikan job dengan unit lain", () => {
  it("muncul di job lama bila semua penggantinya dibatalkan", () => {
    tampil(proyek([job("A", "selesai"), job("B", "cancelled", "A")]));
    expect(screen.getByRole("button", { name: "Selesaikan job dengan unit lain" })).toBeTruthy();
    expect(screen.getByText(/Job pengganti JOB-B dibatalkan/)).toBeTruthy();
  });

  it("tidak muncul bila masih ada pengganti yang berjalan / selesai", () => {
    tampil(proyek([job("A", "selesai"), job("B", "cancelled", "A"), job("C", "loading", "A")]));
    expect(screen.queryByRole("button", { name: "Selesaikan job dengan unit lain" })).toBeNull();
  });

  it("tidak muncul untuk yang hanya melihat (finance / operator)", () => {
    tampil(proyek([job("A", "selesai"), job("B", "cancelled", "A")]), true);
    expect(screen.queryByRole("button", { name: "Selesaikan job dengan unit lain" })).toBeNull();
  });
});

describe("filter job Aktif / Semua", () => {
  it("default Aktif: job dibatalkan disembunyikan; Semua menampilkannya", () => {
    tampil(proyek([job("A", "selesai"), job("B", "cancelled")]));
    expect(screen.getByText("JOB-A")).toBeTruthy();
    expect(screen.queryByText("JOB-B")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Semua/ }));
    expect(screen.getByText("JOB-B")).toBeTruthy();
  });
});

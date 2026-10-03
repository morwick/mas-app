/**
 * Tombol "Update Status Job" di detail job: job Menunggu validasi tidak bisa
 * diubah statusnya manual — muncul peringatan (admin yang memvalidasi). Juga:
 * info internal (sales, catatan internal, biaya lain) tidak untuk operator.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Job, JobStatus, UangJalanRingkasan } from "@/types";

vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ canManageOperational: true, user: { role: "admin", roles: ["admin"] } }),
  useCurrentUser: () => ({ role: "admin", roles: ["admin"] })
}));

import { JobDetailView, PESAN_MENUNGGU_VALIDASI } from "./job-detail-view";

const RINGKASAN = { uang_jalan_awal: 0, tambahan: 0, uang_jalan: 0, cair: 0, sisa: 0 } as UangJalanRingkasan;

function job(status: JobStatus): Job {
  return {
    id: "j1",
    job_number: "JOB-1",
    share_token: "tok",
    customer_id: null,
    customer_nama: "Tanpa customer",
    alat_diangkut: "Excavator",
    asal: "A",
    tujuan: "B",
    unit_id: "u1",
    driver_id: "d1",
    etd: "2026-10-03T01:00:00Z",
    status,
    created_at: "2026-10-03T00:00:00Z",
    photos: []
  } as unknown as Job;
}

function tampil(status: JobStatus, hanyaLihat = false, tampilInfoInternal = true, isi: Partial<Job> = {}) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ToastProvider>
          <JobDetailView
            job={{ ...job(status), ...isi }}
            unit={null}
            driver={null}
            history={[]}
            sumberDana={[]}
            uangJalan={[]}
            uangJalanRingkasan={RINGKASAN}
            hanyaLihat={hanyaLihat}
            tampilInfoInternal={tampilInfoInternal}
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // Data pendukung (riwayat ganti unit, dll.) dibalas kosong.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
});

describe("Update Status Job", () => {
  it("gagal: job Menunggu validasi → peringatan, modal ubah status tidak terbuka", async () => {
    tampil("menunggu_validasi");
    fireEvent.click(screen.getByRole("button", { name: /Update Status Job/ }));
    expect(await screen.findByText(PESAN_MENUNGGU_VALIDASI)).toBeTruthy();
    expect(screen.queryByText("Update status job")).toBeNull();
  });

  it("sukses: job berjalan → modal ubah status terbuka", () => {
    tampil("loading");
    fireEvent.click(screen.getByRole("button", { name: /Update Status Job/ }));
    expect(screen.getByText("Update status job")).toBeTruthy();
    expect(screen.queryByText(PESAN_MENUNGGU_VALIDASI)).toBeNull();
  });

  it("edge: hanya melihat (finance) → tidak ada tombol Update Status Job", () => {
    tampil("menunggu_validasi", true);
    expect(screen.queryByRole("button", { name: /Update Status Job/ })).toBeNull();
  });
});

describe("info internal di detail job", () => {
  const INTERNAL: Partial<Job> = { sales_nama: "Rudi", sales_no_hp: "0812", catatan: "Customer minta foto tambahan" };

  it("finance/admin/superadmin: sales, No HP sales, catatan internal & biaya lain tampil", () => {
    tampil("dalam_perjalanan", true, true, INTERNAL);
    expect(screen.getByText("Rudi")).toBeTruthy();
    expect(screen.getByText("0812")).toBeTruthy();
    expect(screen.getByText("Customer minta foto tambahan")).toBeTruthy();
    expect(screen.getByText("Biaya lain")).toBeTruthy();
  });

  it("operator: sales, No HP sales, catatan internal & biaya lain disembunyikan", () => {
    tampil("dalam_perjalanan", true, false, INTERNAL);
    expect(screen.queryByText("Sales")).toBeNull();
    expect(screen.queryByText("Rudi")).toBeNull();
    expect(screen.queryByText("0812")).toBeNull();
    expect(screen.queryByText("Customer minta foto tambahan")).toBeNull();
    expect(screen.queryByText("Biaya lain")).toBeNull();
  });
});

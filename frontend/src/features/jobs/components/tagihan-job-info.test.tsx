import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/types";
import { TagihanJobInfo } from "./tagihan-job-info";

let role = "admin";
vi.mock("@/lib/auth/AuthContext", () => ({
  useCurrentUser: () => ({ role })
}));

const JOB = {
  id: "j1",
  status: "selesai",
  info_tagihan: true,
  invoice_id: "inv-1",
  invoice_number: "0001/INV/MAS/IX/2026",
  invoice_status_bayar: "partial_paid",
  invoice_status_tampil: "terkirim",
  invoice_sisa: 600_000
} as unknown as Job;

function tampil(job: Job) {
  render(
    <MemoryRouter>
      <TagihanJobInfo job={job} />
    </MemoryRouter>
  );
}

describe("info tagihan di detail job", () => {
  beforeEach(() => {
    role = "admin";
  });

  it("admin: seperti superadmin (status & sisa tampil), tapi nomor tagihan tidak bisa diklik", () => {
    tampil(JOB);
    // Admin tidak punya akses menu Tagihan → nomor berupa teks.
    expect(screen.getByText("0001/INV/MAS/IX/2026").closest("a")).toBeNull();
    expect(screen.getByText("Partial Paid")).toBeTruthy();
    expect(screen.getByText(/Sisa/)).toBeTruthy();
  });

  it("superadmin: nomor tagihan tertaut ke detail tagihan, sisa tampil", () => {
    role = "superadmin";
    tampil(JOB);
    expect(screen.getByText("0001/INV/MAS/IX/2026").closest("a")?.getAttribute("href")).toBe("/invoices/inv-1");
    expect(screen.getByText(/Sisa/)).toBeTruthy();
  });

  it("finance: sama seperti superadmin — tertaut & nominal tampil", () => {
    role = "finance";
    tampil(JOB);
    expect(screen.getByText("0001/INV/MAS/IX/2026").closest("a")?.getAttribute("href")).toBe("/invoices/inv-1");
    expect(screen.getByText(/Sisa/)).toBeTruthy();
  });

  it("operator: info tagihan tidak dikirim → tidak tampil apa pun", () => {
    role = "operator";
    tampil({ id: "j2", status: "selesai", info_tagihan: false } as unknown as Job);
    expect(screen.queryByText(/tagih/i)).toBeNull();
  });

  it("job selesai belum ditagih: tampil 'Belum ditagihkan'; kosongan (tanpa customer): tidak tampil", () => {
    const belum = { ...JOB, invoice_id: null, invoice_number: null, customer_id: "c1" } as unknown as Job;
    const { unmount } = render(
      <MemoryRouter>
        <TagihanJobInfo job={belum} />
      </MemoryRouter>
    );
    expect(screen.getByText("Belum ditagihkan")).toBeTruthy();
    unmount();
    tampil({ ...belum, customer_id: null } as unknown as Job);
    expect(screen.queryByText("Belum ditagihkan")).toBeNull();
  });
});

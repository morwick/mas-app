/**
 * Widget "Perlu approval": hanya tampil bila ada pengajuan yang menunggu
 * keputusan pengguna ini, satu kotak per fitur, menuju halaman approval-nya.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { PerluApprovalCard } from "./perlu-approval-card";

const menu = vi.hoisted(() => ({ data: [] as { kode: string; nama: string; menunggu_saya: number }[] }));
vi.mock("@/features/approval/queries", () => ({ useMenuApproval: () => menu }));

function tampil() {
  return render(
    <MemoryRouter>
      <PerluApprovalCard />
    </MemoryRouter>
  );
}

describe("PerluApprovalCard", () => {
  it("tidak tampil bila bukan approver / tidak ada yang menunggu", () => {
    menu.data = [{ kode: "penjualan_aset", nama: "Penjualan aset", menunggu_saya: 0 }];
    const { container } = tampil();
    expect(container.textContent).toBe("");
  });

  it("satu kotak per fitur yang menunggu, menuju halaman approval fitur itu", () => {
    menu.data = [
      { kode: "tambahan_uang_jalan", nama: "Tambahan uang jalan", menunggu_saya: 2 },
      { kode: "penjualan_aset", nama: "Penjualan aset", menunggu_saya: 0 }
    ];
    tampil();
    expect(screen.getByText("Perlu approval")).toBeTruthy();
    const link = screen.getByText("2 Tambahan uang jalan").closest("a");
    expect(link?.getAttribute("href")).toBe("/approval/tambahan_uang_jalan");
    expect(screen.queryByText(/Penjualan aset/)).toBeNull();
  });
});

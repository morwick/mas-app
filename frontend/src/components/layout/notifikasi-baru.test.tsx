import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/notifications";
import { NotifikasiBaru } from "./notifikasi-baru";

vi.mock("@/features/notifications/api", () => ({
  markNotificationsRead: vi.fn(() => Promise.resolve())
}));

function notif(id: string, title: string): AppNotification {
  return {
    id,
    kind: "uang_jalan_diajukan",
    severity: "warning",
    title,
    body: `Isi ${title}`,
    href: `/uang-jalan?dari=${id}`,
    created_at: "2026-09-26T03:00:00Z"
  };
}

function Wadah({ data }: { data: AppNotification[] | undefined }) {
  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="*" element={<NotifikasiBaru notifications={data} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("popup notifikasi baru", () => {
  beforeEach(() => localStorage.clear());

  it("notifikasi yang sudah ada saat halaman dibuka tidak dimunculkan", () => {
    render(<Wadah data={[notif("a", "Lama")]} />);
    expect(screen.queryByText("Lama")).toBeNull();
  });

  it("notifikasi yang baru masuk muncul sebagai popup dan bisa ditutup", () => {
    const { rerender } = render(<Wadah data={[notif("a", "Lama")]} />);
    rerender(<Wadah data={[notif("b", "Pengajuan baru"), notif("a", "Lama")]} />);
    expect(screen.getByText("Pengajuan baru")).toBeTruthy();
    expect(screen.queryByText("Lama")).toBeNull();
    fireEvent.click(screen.getByLabelText("Tutup notifikasi"));
    expect(screen.queryByText("Pengajuan baru")).toBeNull();
  });

  it("lebih dari 3 notifikasi baru → sisanya dirangkum", () => {
    const { rerender } = render(<Wadah data={[]} />);
    rerender(<Wadah data={["1", "2", "3", "4", "5"].map((i) => notif(i, `N${i}`))} />);
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(screen.getByText(/\+2 notifikasi baru lainnya/)).toBeTruthy();
  });

  it("klik popup menandai dibaca", () => {
    const { rerender } = render(<Wadah data={[]} />);
    rerender(<Wadah data={[notif("b", "Pengajuan baru")]} />);
    fireEvent.click(screen.getByText("Pengajuan baru"));
    expect(screen.queryByText("Pengajuan baru")).toBeNull();
    expect(localStorage.getItem("mas:notif:read-ids")).toContain("b");
  });
});

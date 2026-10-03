/** Menu Mekanik: foto profil inisial seperti halaman Pengguna & Karyawan. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mekanik } from "./api";

const mekanik = (isi: Partial<Mekanik>): Mekanik => ({
  id: "m1",
  karyawan_id: "k1",
  nama: "Budi Santoso",
  no_hp: null,
  keahlian: null,
  catatan: null,
  is_active: true,
  karyawan_aktif: true,
  ...isi
});

const items = [mekanik({}), mekanik({ id: "m2", nama: "Andi Wijaya", is_active: false })];

vi.mock("./api", () => ({
  useMekanikPage: () => ({
    data: { items, total: items.length, page: 1, page_size: 10 },
    isPending: false,
    isError: false,
    isPlaceholderData: false
  }),
  useKaryawanMekanik: () => ({ data: [] }),
  createMekanik: vi.fn(),
  updateMekanik: vi.fn(),
  setMekanikAktif: vi.fn(),
  deleteMekanik: vi.fn()
}));
vi.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => ({ canManageOperational: true }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { MekanikView } from "./mekanik-view";

describe("MekanikView — foto profil", () => {
  it("inisial nama tampil; abu-abu bila mekanik nonaktif", () => {
    render(<MekanikView />);
    expect(screen.getByText("BS").getAttribute("style")).toContain("var(--brand-primary)");
    expect(screen.getByText("AW").getAttribute("style")).toContain("var(--text-tertiary)");
  });
});

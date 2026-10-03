/** Menu Karyawan: blacklist (wajib alasan) dan cabut blacklist. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Karyawan } from "../api";

const blacklistKaryawan = vi.fn();
const cabutBlacklistKaryawan = vi.fn();
vi.mock("../api", () => ({
  blacklistKaryawan: (...a: unknown[]) => blacklistKaryawan(...a),
  cabutBlacklistKaryawan: (...a: unknown[]) => cabutBlacklistKaryawan(...a),
  createKaryawan: vi.fn(),
  deleteKaryawan: vi.fn(),
  updateKaryawan: vi.fn()
}));

let items: Karyawan[] = [];
vi.mock("../queries", () => ({
  useKaryawanList: () => ({
    data: { items, total: items.length, page: 1, page_size: 10 },
    isPending: false,
    isError: false,
    isPlaceholderData: false
  })
}));

const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError })
}));

import { KaryawanView } from "./karyawan-view";

/** Tombol aksi baris (ber-ikon) — bukan chip filter yang labelnya sama. */
const tombolAksi = (nama: string) =>
  screen.getAllByRole("button", { name: nama }).filter((b) => b.querySelector("svg"));

const dasar: Karyawan = {
  id: "k1",
  nama: "Budi",
  tanggal_lahir: null,
  alamat: null,
  is_active: true,
  akun: [],
  driver: { id: "d1", no_hp: "0812" },
  mekanik: null,
  is_blacklist: false,
  blacklist_alasan: null,
  blacklist_at: null,
  blacklist_oleh_nama: null
};

describe("KaryawanView — foto profil", () => {
  it("menampilkan inisial nama seperti di halaman Pengguna; abu-abu bila di-blacklist", () => {
    items = [
      { ...dasar, nama: "Budi Santoso" },
      { ...dasar, id: "k2", nama: "Andi Wijaya", is_blacklist: true }
    ];
    render(<KaryawanView />);
    expect(screen.getAllByText("BS")[0].getAttribute("style")).toContain("var(--brand-primary)");
    expect(screen.getAllByText("AW")[0].getAttribute("style")).toContain("var(--text-tertiary)");
  });
});

describe("KaryawanView — blacklist", () => {
  beforeEach(() => {
    blacklistKaryawan.mockReset().mockResolvedValue({ ok: true, data: null });
    cabutBlacklistKaryawan.mockReset().mockResolvedValue({ ok: true, data: null });
    toastError.mockReset();
  });

  it("blacklist wajib alasan, lalu memanggil API dengan alasannya", async () => {
    items = [dasar];
    render(<KaryawanView />);
    fireEvent.click(tombolAksi("Blacklist")[0]);
    expect(screen.getByText(/sesi login yang sedang berjalan langsung dicabut/)).toBeTruthy();

    const kirim = () =>
      fireEvent.submit(document.getElementById("blacklist-form") as HTMLFormElement);
    kirim();
    expect(toastError).toHaveBeenCalledWith("Alasan blacklist wajib diisi.");
    expect(blacklistKaryawan).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("mis. Membawa kabur solar perusahaan"), {
      target: { value: "  Membawa kabur solar " }
    });
    kirim();
    await waitFor(() => expect(blacklistKaryawan).toHaveBeenCalledWith("k1", "Membawa kabur solar"));
  });

  it("karyawan blacklist menampilkan alasan dan tombol cabut", async () => {
    items = [
      {
        ...dasar,
        is_active: false,
        is_blacklist: true,
        blacklist_alasan: "Membawa kabur solar",
        blacklist_at: "2026-10-01T01:00:00Z",
        blacklist_oleh_nama: "Super Admin"
      }
    ];
    render(<KaryawanView />);
    expect(screen.getAllByText(/Alasan: Membawa kabur solar/).length).toBeGreaterThan(0);
    expect(tombolAksi("Blacklist")).toHaveLength(0);

    fireEvent.click(tombolAksi("Cabut blacklist")[0]);
    fireEvent.submit(document.getElementById("cabut-blacklist-form") as HTMLFormElement);
    await waitFor(() => expect(cabutBlacklistKaryawan).toHaveBeenCalledWith("k1", null));
  });
});

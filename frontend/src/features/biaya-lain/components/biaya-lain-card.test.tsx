/**
 * Kartu Biaya Lain di detail job: tombol Tambah hanya sebelum ada tagihan,
 * detail lewat ikon kaca pembesar, total. Skenario sukses, edge, dan terkunci.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BiayaLain } from "@/types";
import { formatRupiah } from "@/lib/utils";
import { BiayaLainCard } from "./biaya-lain-card";

const biaya: { data: BiayaLain[] | undefined; isPending: boolean; isError: boolean } = {
  data: [],
  isPending: false,
  isError: false
};

vi.mock("../queries", () => ({
  useBiayaLainJob: () => biaya,
  useJenisBiaya: () => ({ data: [{ id: "t1", nama: "Tol" }] })
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
const createBiayaLain = vi.fn();
vi.mock("../api", () => ({
  createBiayaLain: (...args: unknown[]) => createBiayaLain(...args),
  updateBiayaLain: vi.fn(),
  deleteBiayaLain: vi.fn()
}));

const TOL: BiayaLain = {
  id: "b1",
  job_id: "j1",
  jenis_biaya_id: "t1",
  jenis_biaya_nama: "Tol",
  nominal: 25_000,
  catatan: "Tol Cikampek",
  created_by_nama: "Admin Satu",
  created_at: "2026-10-03T01:00:00Z"
};

const rapi = (s: string | null) => (s ?? "").replace(/\s/g, " ");

describe("BiayaLainCard", () => {
  beforeEach(() => {
    biaya.data = [];
  });

  it("edge: belum ada biaya → teks kosong dan tombol Tambah tampil", () => {
    render(<BiayaLainCard jobId="j1" hanyaLihat={false} nomorTagihan={null} />);
    expect(screen.getByText("Belum ada biaya lain.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tambah/ })).toBeTruthy();
  });

  it("sukses: daftar + total, kaca pembesar membuka detail lengkap dengan pembuat", () => {
    biaya.data = [TOL, { ...TOL, id: "b2", jenis_biaya_nama: "Parkir", nominal: 5_000, catatan: null }];
    render(<BiayaLainCard jobId="j1" hanyaLihat={false} nomorTagihan={null} />);
    const total = screen.getByText("Total").closest("tr")!;
    expect(rapi(within(total).getAllByRole("cell")[1].textContent)).toBe(rapi(formatRupiah(30_000)));

    fireEvent.click(screen.getByRole("button", { name: "Lihat detail biaya Tol" }));
    expect(screen.getByText("Detail biaya lain")).toBeTruthy();
    expect(screen.getByText("Tol Cikampek")).toBeTruthy();
    expect(screen.getByText("Admin Satu")).toBeTruthy();
    // Belum ditagih → bisa diubah / dihapus dari detail.
    expect(screen.getByRole("button", { name: "Ubah" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hapus" })).toBeTruthy();
  });

  it("terkunci: job sudah ditagih → tanpa Tambah/Ubah/Hapus, detail tetap bisa dilihat", () => {
    biaya.data = [TOL];
    render(<BiayaLainCard jobId="j1" hanyaLihat={false} nomorTagihan="INV/2026/001" />);
    expect(screen.queryByRole("button", { name: /Tambah/ })).toBeNull();
    expect(screen.getByText(/Job sudah ditagihkan \(INV\/2026\/001\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lihat detail biaya Tol" }));
    expect(screen.getByText("Tol Cikampek")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hapus" })).toBeNull();
  });

  it("hanya lihat (finance/operator): tanpa tombol Tambah", () => {
    render(<BiayaLainCard jobId="j1" hanyaLihat nomorTagihan={null} />);
    expect(screen.queryByRole("button", { name: /Tambah/ })).toBeNull();
  });

  it("jenis biaya bisa diketik; bila belum ada di daftar muncul opsi Tambah dan terkirim sebagai jenis baru", async () => {
    createBiayaLain.mockResolvedValue({ ok: true, data: null });
    render(<BiayaLainCard jobId="j1" hanyaLihat={false} nomorTagihan={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Tambah/ }));
    fireEvent.click(document.querySelector<HTMLButtonElement>(".combobox-trigger")!);
    fireEvent.change(screen.getByPlaceholderText("Ketik jenis biaya…"), { target: { value: "Parkir" } });
    fireEvent.click(screen.getByText('Tambah "Parkir" sebagai jenis biaya baru'));
    // Jenis baru tampil terpilih di form.
    expect(document.querySelector(".combobox-trigger")!.textContent).toContain("Parkir");
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createBiayaLain).toHaveBeenCalledWith("j1", {
        jenis_biaya_id: null,
        jenis_biaya_nama: "Parkir",
        nominal: 15000,
        catatan: null
      })
    );
  });
});

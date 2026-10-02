/**
 * Halaman Approval: daftar ringkas (tanpa badge "Giliran Anda"); klik pengajuan
 * membuka halaman detail /approval/:fitur/:id.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PengajuanApproval } from "../api";

let items: PengajuanApproval[] = [];
const usePengajuanList = vi.fn();
vi.mock("../queries", () => ({
  usePengajuanList: (f: unknown) => {
    usePengajuanList(f);
    return { data: { items, total: items.length, page: 1, page_size: 10 }, isPending: false, isError: false };
  }
}));

import { PengajuanView } from "./pengajuan-view";

function pengajuan(ubah: Partial<PengajuanApproval> = {}): PengajuanApproval {
  return {
    id: "p1",
    fitur_kode: "tambahan_uang_jalan",
    ref_id: "u1",
    judul: "Tambahan uang jalan JOB-001 · Ban pecah",
    rincian: { job_id: "j1", job_number: "JOB-001", rute: "Pekanbaru → Dumai", keperluan: "Ban pecah" },
    nilai: 500_000,
    mode: "berjenjang",
    status_approval: "menunggu",
    diajukan_oleh_nama: "Admin",
    diajukan_at: "2026-10-01T01:00:00Z",
    giliran_saya: true,
    langkah: [
      { karyawan_id: "k1", nama: "Andi", urutan: 1, keputusan: "menunggu" },
      { karyawan_id: "k2", nama: "Budi", urutan: 2, keputusan: "menunggu" }
    ],
    ...ubah
  };
}

function tampil(menungguSaya = 1) {
  render(
    <MemoryRouter initialEntries={["/approval/tambahan_uang_jalan"]}>
      <Routes>
        <Route
          path="/approval/tambahan_uang_jalan"
          element={<PengajuanView fitur="tambahan_uang_jalan" namaFitur="Tambahan Uang Jalan" menungguSaya={menungguSaya} />}
        />
        <Route path="/approval/:fitur/:id" element={<div>HALAMAN DETAIL</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PengajuanView (daftar)", () => {
  beforeEach(() => usePengajuanList.mockReset());

  it("daftar ringkas: tanpa badge Giliran Anda, tanpa rincian & tombol keputusan", () => {
    items = [pengajuan()];
    tampil();
    expect(usePengajuanList).toHaveBeenCalledWith(expect.objectContaining({ hanyaGiliran: true }));
    expect(screen.queryByText("Giliran Anda")).toBeNull();
    expect(screen.queryByText("JOB-001")).toBeNull();
    expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull();
  });

  it("klik pengajuan membuka halaman detail", () => {
    items = [pengajuan()];
    tampil();
    fireEvent.click(screen.getAllByText("Tambahan uang jalan JOB-001 · Ban pecah")[0]);
    expect(screen.getByText("HALAMAN DETAIL")).toBeTruthy();
  });

  it("tanpa giliran sama sekali → tab Semua", () => {
    items = [pengajuan({ giliran_saya: false, status_approval: "disetujui" })];
    tampil(0);
    expect(usePengajuanList).toHaveBeenCalledWith(expect.objectContaining({ hanyaGiliran: false }));
    expect(screen.getAllByText("Disetujui").some((e) => e.classList.contains("badge"))).toBe(true);
  });
});

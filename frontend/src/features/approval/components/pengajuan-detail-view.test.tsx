/**
 * Halaman detail pengajuan: rincian & alur berjenjang tampil; kotak keputusan
 * hanya saat giliran; tolak wajib alasan; setelah diputuskan kembali ke daftar.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/utils";
import type { PengajuanApproval } from "../api";

const putuskanPengajuan = vi.fn();
vi.mock("../api", async (asli) => ({
  ...(await asli<typeof import("../api")>()),
  putuskanPengajuan: (...a: unknown[]) => putuskanPengajuan(...a)
}));

const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError })
}));

import { PengajuanDetailView } from "./pengajuan-detail-view";

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

function tampil(p: PengajuanApproval) {
  render(
    <MemoryRouter initialEntries={["/approval/tambahan_uang_jalan/p1"]}>
      <Routes>
        <Route path="/approval/tambahan_uang_jalan/p1" element={<PengajuanDetailView p={p} namaFitur="Tambahan Uang Jalan" />} />
        <Route path="/approval/tambahan_uang_jalan" element={<div>DAFTAR APPROVAL</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PengajuanDetailView", () => {
  beforeEach(() => {
    putuskanPengajuan.mockReset().mockResolvedValue({ ok: true, data: { status_approval: "menunggu" } });
    toastError.mockReset();
  });

  it("rincian, alur berjenjang, dan kotak keputusan saat giliran", () => {
    tampil(pengajuan());
    expect(screen.getByText("JOB-001").closest("a")?.getAttribute("href")).toBe("/jobs/j1");
    expect(screen.getByText("JOB-001").closest("a")?.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Andi")).toBeTruthy();
    expect(screen.getByText("Level 1")).toBeTruthy();
    expect(screen.getByText("Level 2")).toBeTruthy();
    expect(screen.getAllByText(/Menunggu/).length).toBeGreaterThan(0);
    expect(screen.getByText("Keputusan Anda")).toBeTruthy();
    expect(screen.queryByText("Giliran Anda")).toBeNull();
  });

  it("tolak wajib alasan; minta konfirmasi; lalu terkirim dan kembali ke daftar", async () => {
    tampil(pengajuan());
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    expect(toastError).toHaveBeenCalledWith("Alasan penolakan wajib diisi.");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " Terlalu besar " } });
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    // Belum tersimpan sebelum dikonfirmasi.
    expect(screen.getByText(/Apakah Anda yakin menolak/)).toBeTruthy();
    expect(putuskanPengajuan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ya, tolak" }));
    await waitFor(() => expect(putuskanPengajuan).toHaveBeenCalledWith("p1", false, "Terlalu besar"));
    await waitFor(() => expect(screen.getByText("DAFTAR APPROVAL")).toBeTruthy());
  });

  it("setujui: konfirmasi Batal tidak menyimpan; Ya menyimpan sekali saja", async () => {
    tampil(pengajuan());
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(putuskanPengajuan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));
    const ya = screen.getByRole("button", { name: "Ya, setujui" });
    fireEvent.click(ya);
    fireEvent.click(ya);
    await waitFor(() => expect(putuskanPengajuan).toHaveBeenCalledWith("p1", true, null));
    expect(putuskanPengajuan).toHaveBeenCalledTimes(1);
  });

  it("bukan giliran → tanpa kotak keputusan", () => {
    tampil(pengajuan({ giliran_saya: false, status_approval: "disetujui" }));
    expect(screen.queryByText("Keputusan Anda")).toBeNull();
    expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull();
  });

  it("satu approver saja → namanya tetap ditampilkan dengan status Menunggu", () => {
    tampil(pengajuan({ mode: "salah_satu", langkah: [{ karyawan_id: "k1", nama: "Andi", urutan: 1, keputusan: "menunggu" }] }));
    expect(screen.getByText("Andi")).toBeTruthy();
    expect(screen.queryByText("Level 1")).toBeNull();
  });

  it("mode salah satu: approver yang belum memutuskan tetap Menunggu walau sudah ada yang menolak", () => {
    tampil(
      pengajuan({
        mode: "salah_satu",
        giliran_saya: false,
        status_approval: "ditolak",
        langkah: [
          { karyawan_id: "k1", nama: "Andi", urutan: 1, keputusan: "tolak", catatan: "Tidak perlu" },
          { karyawan_id: "k2", nama: "Budi", urutan: 1, keputusan: "dilewati" }
        ]
      })
    );
    expect(screen.queryByText(/Dilewati/)).toBeNull();
    expect(screen.getByText(/Menunggu/)).toBeTruthy();
    expect(screen.getByText(/Catatan penolakan Andi/)).toBeTruthy();
  });

  it("uang jalan awal, tambahan sudah disetujui, dan total uang jalan job — nominal tebal", () => {
    tampil(
      pengajuan({
        rincian: { job_id: "j1", job_number: "JOB-001", rute: "A → B", uang_jalan_awal: 5_000_000, tambahan_disetujui: 3_000_000 }
      })
    );
    expect(screen.getByText("Uang jalan awal")).toBeTruthy();
    expect(screen.getByText("Rp 5.000.000").tagName).toBe("STRONG");
    expect(screen.getByText("Rp 3.000.000").tagName).toBe("STRONG");
    expect(screen.getByText("Total uang jalan untuk job ini")).toBeTruthy();
    expect(screen.getByText("Rp 8.000.000").tagName).toBe("STRONG");
  });

  it("belum pernah ada tambahan disetujui → hanya uang jalan awal", () => {
    tampil(
      pengajuan({
        rincian: { job_id: "j1", job_number: "JOB-001", rute: "A → B", uang_jalan_awal: 5_000_000, tambahan_disetujui: 0 }
      })
    );
    expect(screen.getByText("Rp 5.000.000").tagName).toBe("STRONG");
    expect(screen.queryByText("Tambahan sudah disetujui")).toBeNull();
    expect(screen.queryByText("Total uang jalan untuk job ini")).toBeNull();
  });

  it("rute asal & tujuan dipisah berdampingan", () => {
    tampil(pengajuan());
    expect(screen.getByText("Asal")).toBeTruthy();
    expect(screen.getByText("Pekanbaru")).toBeTruthy();
    expect(screen.getByText("Tujuan")).toBeTruthy();
    expect(screen.getByText("Dumai")).toBeTruthy();
  });

  it("status disetujui beserta waktunya; yang menolak → catatan penolakan di bawah daftar", () => {
    tampil(
      pengajuan({
        giliran_saya: false,
        status_approval: "ditolak",
        alasan_tolak: "Nominal terlalu besar",
        langkah: [
          { karyawan_id: "k1", nama: "Andi", urutan: 1, keputusan: "setuju", diputuskan_at: "2026-10-01T02:00:00Z" },
          {
            karyawan_id: "k2",
            nama: "Budi",
            urutan: 2,
            keputusan: "tolak",
            catatan: "Nominal terlalu besar",
            diputuskan_at: "2026-10-01T03:00:00Z"
          }
        ]
      })
    );
    expect(screen.getByText(/Disetujui|Setuju/)).toBeTruthy();
    expect(screen.getAllByText(formatDateTime("2026-10-01T02:00:00Z")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Catatan penolakan Budi/)).toBeTruthy();
    expect(screen.getByText(/Nominal terlalu besar/)).toBeTruthy();
  });

  it("catatan persetujuan tampil bila diisi; yang tanpa catatan tidak", () => {
    tampil(
      pengajuan({
        giliran_saya: false,
        status_approval: "disetujui",
        langkah: [
          { karyawan_id: "k1", nama: "Andi", urutan: 1, keputusan: "setuju", catatan: "Sesuai, ban pecah" },
          { karyawan_id: "k2", nama: "Budi", urutan: 2, keputusan: "setuju" }
        ]
      })
    );
    expect(screen.getByText(/Catatan persetujuan Andi/)).toBeTruthy();
    expect(screen.getByText(/Sesuai, ban pecah/)).toBeTruthy();
    expect(screen.queryByText(/Catatan persetujuan Budi/)).toBeNull();
  });
});

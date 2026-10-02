import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { UangJalan } from "@/types";
const deleteUangJalan = vi.fn();
vi.mock("@/features/uang-jalan/api", async (asli) => ({
  ...(await asli<typeof import("@/features/uang-jalan/api")>()),
  deleteUangJalan: (...a: unknown[]) => deleteUangJalan(...a)
}));

import { UangJalanCard } from "./uang-jalan-card";

const RINGKASAN = { uang_jalan_awal: 1_000_000, tambahan: 0, uang_jalan: 1_000_000, cair: 500_000, sisa: 500_000, persen_cair: 50 };

function transaksi(id: string, request_id: string | null): UangJalan {
  return {
    id,
    job_id: "j1",
    jenis: "pencairan",
    tanggal: "2026-09-20",
    jumlah: 250_000,
    sumber_dana_nama: "Kas",
    created_at: "2026-09-20T00:00:00Z",
    bukti_transfer_url: `https://x/${id}.jpg`,
    request_id
  };
}

/** Render kartu; riwayat (mulai terciut) langsung dibuka kecuali `terciut`. */
function tampil(props: Partial<Parameters<typeof UangJalanCard>[0]> = {}, terciut = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <UangJalanCard
          jobId="j1"
          sumberDana={[]}
          transaksi={[transaksi("dari-driver", "req-1"), transaksi("manual", null)]}
          ringkasan={RINGKASAN}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  if (!terciut) fireEvent.click(screen.getByRole("button", { name: /Riwayat uang jalan/ }));
}

describe("kartu uang jalan di detail job", () => {
  it("pencairan dari pengajuan driver hanya bisa dilihat bukti transfernya", () => {
    tampil();
    expect(screen.getAllByText("Lihat bukti transfer")).toHaveLength(2);
    // Hanya transaksi manual yang punya tombol ubah & hapus.
    expect(screen.getAllByTitle("Ubah")).toHaveLength(1);
    expect(screen.getAllByTitle("Hapus")).toHaveLength(1);
    expect(screen.getByText("Ajukan")).toBeTruthy();
  });

  it("job sudah ditagihkan: tombol Ajukan hilang", () => {
    tampil({ nomorTagihan: "0001/INV" });
    expect(screen.queryByText("Ajukan")).toBeNull();
    expect(screen.getByText(/sudah ditagihkan \(0001\/INV\)/)).toBeTruthy();
  });

  it("finance (hanya lihat): tidak ada tombol aksi — hanya tombol ciutkan riwayat", () => {
    tampil({ hanyaLihat: true });
    const tombol = screen.getAllByRole("button");
    expect(tombol).toHaveLength(1);
    expect(tombol[0].textContent).toMatch(/Riwayat uang jalan/);
  });

  it("sudah ada uang jalan keluar → uang jalan awal terkunci", () => {
    tampil();
    expect(screen.queryByRole("button", { name: "Ubah uang jalan awal" })).toBeNull();
    expect(screen.queryByText(/Uang jalan awal terkunci/)).toBeNull();
  });

  it("belum ada uang jalan keluar → uang jalan awal masih bisa diubah", () => {
    tampil({ transaksi: [], ringkasan: { ...RINGKASAN, cair: 0, sisa: 1_000_000, persen_cair: 0 } });
    expect(screen.getByRole("button", { name: "Ubah uang jalan awal" })).toBeTruthy();
    expect(screen.queryByText(/Uang jalan awal terkunci/)).toBeNull();
  });

  it("rincian di bawah nominal uang jalan tidak ditampilkan lagi", () => {
    tampil({ ringkasan: { ...RINGKASAN, tambahan: 300_000, uang_jalan: 1_300_000, tambahan_menunggu: 200_000 } });
    expect(screen.queryByText(/\+ tambahan/)).toBeNull();
    expect(screen.queryByText(/menunggu approval/)).toBeNull();
  });

  it("Tambah uang jalan: alasan & catatan tidak di riwayat, tapi di modal Lihat detail", () => {
    tampil({
      transaksi: [
        {
          ...transaksi("t1", null),
          jenis: "tambahan",
          status_approval: "disetujui",
          keperluan: "Ban pecah",
          catatan: "Di tol Cipali"
        }
      ]
    });
    expect(screen.queryByText(/Ban pecah/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lihat detail" }));
    expect(screen.getByText("Detail tambahan uang jalan")).toBeTruthy();
    expect(screen.getByText("Alasan penambahan")).toBeTruthy();
    expect(screen.getByText("Ban pecah")).toBeTruthy();
    expect(screen.getByText("Di tol Cipali")).toBeTruthy();
  });

  it("riwayat diawali baris uang jalan awal; nominal total berlabel TOTAL UJ", () => {
    tampil({ tanggalAwal: "2026-09-18T02:00:00Z" });
    expect(screen.getByText("TOTAL UJ")).toBeTruthy();
    expect(screen.getByText("Uang jalan awal")).toBeTruthy();
    expect(screen.getByText("18 Sep 2026")).toBeTruthy();
  });

  it("tambahan yang sudah disetujui / ditolak: tanpa tombol ubah & hapus; yang menunggu masih ada", () => {
    tampil({
      transaksi: [
        { ...transaksi("t1", null), jenis: "tambahan", status_approval: "disetujui" },
        { ...transaksi("t3", null), jenis: "tambahan", status_approval: "ditolak" },
        { ...transaksi("t2", null), jenis: "tambahan", status_approval: "menunggu" }
      ]
    });
    expect(screen.getAllByTitle("Hapus")).toHaveLength(1);
    expect(screen.getAllByTitle("Ubah")).toHaveLength(1);
  });

  it("hapus pengajuan tambahan: modal berjudul pengajuan, berisi tanggal & nominal saja", () => {
    tampil({ transaksi: [{ ...transaksi("t2", null), jenis: "tambahan", status_approval: "menunggu" }] });
    fireEvent.click(screen.getByTitle("Hapus"));
    expect(screen.getByText("Hapus pengajuan uang jalan?")).toBeTruthy();
    expect(screen.getByText("Tanggal")).toBeTruthy();
    expect(screen.getByText("Nominal")).toBeTruthy();
    expect(screen.queryByText(/dihitung ulang/)).toBeNull();
  });

  it("pengajuan tambahan yang dibatalkan tetap tampil di riwayat, tanpa tombol aksi", () => {
    tampil({
      transaksi: [],
      dibatalkan: [{ id: "b1", tanggal: "2026-09-21", jumlah: 700_000, keperluan: "Ban", created_at: "2026-09-21T01:00:00Z" }]
    });
    expect(screen.getByText("Dibatalkan")).toBeTruthy();
    expect(screen.getByText("+Rp 700.000")).toBeTruthy();
    expect(screen.queryByTitle("Hapus")).toBeNull();
  });

  it("riwayat uang jalan mulai terciut; bisa dibuka & diciutkan lagi", () => {
    tampil({}, true);
    const tombol = screen.getByRole("button", { name: /Riwayat uang jalan/ });
    expect(screen.queryByText("Lihat bukti transfer")).toBeNull();
    fireEvent.click(tombol);
    expect(screen.getAllByText("Lihat bukti transfer").length).toBeGreaterThan(0);
    fireEvent.click(tombol);
    expect(screen.queryByText("Lihat bukti transfer")).toBeNull();
  });

  it("hapus: popup loading tampil, klik ganda tetap sekali, hanya kartu job ini yang ditunggu", async () => {
    let selesai: (v: unknown) => void = () => {};
    deleteUangJalan.mockReset().mockReturnValue(new Promise((r) => (selesai = r)));
    tampil({ transaksi: [{ ...transaksi("t2", null), jenis: "tambahan", status_approval: "menunggu" }] });
    fireEvent.click(screen.getByTitle("Hapus"));
    // Tombol "Hapus" di jendela konfirmasi (ikon baris juga bernama "Hapus").
    const ya = screen.getAllByRole("button", { name: "Hapus" }).find((b) => b.textContent === "Hapus")!;
    fireEvent.click(ya);
    fireEvent.click(ya);
    expect(screen.getByText("Menghapus pengajuan…")).toBeTruthy();
    expect(deleteUangJalan).toHaveBeenCalledTimes(1);
    expect(deleteUangJalan).toHaveBeenCalledWith("t2", "j1");
    selesai({ ok: true, data: null });
    await waitFor(() => expect(screen.queryByText("Menghapus pengajuan…")).toBeNull());
  });
});

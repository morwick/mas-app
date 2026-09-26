import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { UangJalan } from "@/types";
import { UangJalanCard } from "./uang-jalan-card";

const RINGKASAN = { pagu_awal: 1_000_000, penambahan: 0, pagu: 1_000_000, cair: 500_000, sisa: 500_000, persen_cair: 50 };

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

function tampil(props: Partial<Parameters<typeof UangJalanCard>[0]> = {}) {
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
}

describe("kartu uang jalan di detail job", () => {
  it("pencairan dari pengajuan driver hanya bisa dilihat bukti transfernya", () => {
    tampil();
    expect(screen.getAllByText("Lihat bukti transfer")).toHaveLength(2);
    // Hanya transaksi manual yang punya tombol ubah & hapus.
    expect(screen.getAllByTitle("Ubah")).toHaveLength(1);
    expect(screen.getAllByTitle("Hapus")).toHaveLength(1);
    expect(screen.getByText("Catat")).toBeTruthy();
  });

  it("job sudah ditagihkan: tombol Catat hilang", () => {
    tampil({ nomorTagihan: "0001/INV" });
    expect(screen.queryByText("Catat")).toBeNull();
    expect(screen.getByText(/sudah ditagihkan \(0001\/INV\)/)).toBeTruthy();
  });

  it("finance (hanya lihat): tidak ada tombol apa pun", () => {
    tampil({ hanyaLihat: true });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

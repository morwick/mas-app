/** Modal catat uang jalan: pemberian ke driver tidak boleh melebihi sisa uang jalan job. */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SumberDana, UangJalan, UangJalanRingkasan } from "@/types";

const createPencairan = vi.fn();
const updateUangJalan = vi.fn();
vi.mock("@/features/uang-jalan/api", () => ({
  createPencairan: (...a: unknown[]) => createPencairan(...a),
  createUangJalan: vi.fn(),
  updateUangJalan: (...a: unknown[]) => updateUangJalan(...a)
}));
const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: toastError })
}));

import { UangJalanModal } from "./uang-jalan-modal";

const KAS: SumberDana[] = [{ id: "s1", nama: "Kas Kantor" } as SumberDana];
// Uang jalan 2 jt, sudah diberikan 1,5 jt → sisa 500 rb.
const RINGKASAN = { uang_jalan_awal: 2_000_000, tambahan: 0, uang_jalan: 2_000_000, cair: 1_500_000, sisa: 500_000 } as UangJalanRingkasan;

function tampil(existing: UangJalan | null = null) {
  render(
    <UangJalanModal
      open
      onClose={() => {}}
      jobId="j1"
      sumberDana={KAS}
      ringkasan={RINGKASAN}
      existing={existing}
      onSaved={() => {}}
    />
  );
}

function isiJumlah(nilai: string) {
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: nilai } });
}

describe("UangJalanModal — batas uang jalan", () => {
  beforeEach(() => {
    createPencairan.mockReset().mockResolvedValue({ ok: true, data: null });
    updateUangJalan.mockReset().mockResolvedValue({ ok: true, data: null });
    toastError.mockReset();
  });

  it("menolak pemberian yang melebihi sisa uang jalan", () => {
    tampil();
    isiJumlah("600000");
    expect(screen.getByText(/melebihi sisa uang jalan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Melebihi sisa uang jalan/));
    expect(createPencairan).not.toHaveBeenCalled();
  });

  it("pas sama dengan sisa → tidak ada peringatan", () => {
    tampil();
    isiJumlah("500000");
    expect(screen.queryByText(/melebihi sisa uang jalan/)).toBeNull();
  });

  it("mengubah pencairan lama: nominal lamanya ikut dihitung sebagai sisa", () => {
    // Pencairan lama 1 jt → boleh diubah sampai 1,5 jt (1 jt + sisa 500 rb).
    tampil({ id: "u1", jenis: "pencairan", tanggal: "2026-09-01", jumlah: 1_000_000 } as UangJalan);
    isiJumlah("1500000");
    expect(screen.queryByText(/melebihi sisa uang jalan/)).toBeNull();
    isiJumlah("1500001");
    expect(screen.getByText(/melebihi sisa uang jalan/)).toBeTruthy();
  });

  it("tombol jenis tambahan memakai istilah uang jalan", () => {
    tampil();
    expect(screen.getByRole("button", { name: "Tambah uang jalan" })).toBeTruthy();
    expect(screen.queryByText(/pagu/i)).toBeNull();
  });
});

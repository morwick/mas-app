/** Modal catat uang jalan: pemberian ke driver tidak boleh melebihi sisa uang jalan job. */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatRupiah } from "@/lib/utils";
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

describe("UangJalanModal — tampilan", () => {
  beforeEach(() => {
    createPencairan.mockReset().mockResolvedValue({ ok: true, data: null });
    toastError.mockReset();
  });

  it("menampilkan ringkasan uang jalan, sudah diberikan, dan sisa", () => {
    tampil();
    expect(screen.getByText("Sudah diberikan")).toBeTruthy();
    expect(screen.getByText("Sisa")).toBeTruthy();
    // formatRupiah memakai spasi tak-terputus — dicocokkan isi elemen apa adanya.
    const angka = (n: number) => (_: string, el: Element | null) =>
      el?.className === "mono" && el.textContent === formatRupiah(n);
    expect(screen.getByText(angka(500_000))).toBeTruthy();
    expect(screen.getByText(angka(1_500_000))).toBeTruthy();
  });

  it("isian kosong → pesan di bawah isian, tidak dikirim", () => {
    tampil();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByText("Jumlah harus diisi")).toBeTruthy();
    expect(screen.getByText("Foto bukti transfer wajib dilampirkan")).toBeTruthy();
    expect(createPencairan).not.toHaveBeenCalled();
  });

  it("foto bukti dipilih → nama file tampil dan bisa dihapus", () => {
    tampil();
    const file = new File(["x"], "bukti.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Foto bukti transfer"), { target: { files: [file] } });
    expect(screen.getByText("bukti.jpg")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Hapus foto"));
    expect(screen.queryByText("bukti.jpg")).toBeNull();
    expect(screen.getByRole("button", { name: /Pilih foto bukti transfer/ })).toBeTruthy();
  });

  it("isian lengkap → pencairan dikirim dengan foto bukti", async () => {
    tampil();
    isiJumlah("400000");
    const file = new File(["x"], "bukti.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Foto bukti transfer"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await vi.waitFor(() => expect(createPencairan).toHaveBeenCalledTimes(1));
    expect(createPencairan.mock.calls[0][0]).toMatchObject({ jumlah: 400000, sumber_dana_id: "s1" });
    expect(createPencairan.mock.calls[0][1]).toBe(file);
  });
});

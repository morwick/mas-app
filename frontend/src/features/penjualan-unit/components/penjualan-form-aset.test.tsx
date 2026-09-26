import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PenjualanFormModal } from "./penjualan-form-modal";
import * as api from "../api";

function tampil() {
  vi.spyOn(api, "asetPilihan").mockResolvedValue([
    { id: "u1", kode: "TR-01", jenis_nama: "Lowbed", status: "standby", alasan_tidak_bisa: null, insiden_terbuka: 0 },
    {
      id: "u2",
      kode: "TR-02",
      jenis_nama: "Lowbed",
      status: "perbaikan",
      alasan_tidak_bisa: "Tidak bisa menjual unit TR-02 karena unit sedang perbaikan.",
      insiden_terbuka: 1
    },
    { id: "u3", kode: "TR-03", jenis_nama: "Lowbed", status: "breakdown", alasan_tidak_bisa: null, insiden_terbuka: 2 }
  ]);
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PenjualanFormModal open onClose={() => {}} onSubmit={onSubmit} busy={false} />
    </QueryClientProvider>
  );
  return onSubmit;
}

async function pilih(kode: string) {
  fireEvent.click(await screen.findByText("Pilih unit"));
  fireEvent.click(await screen.findByText(kode));
}

function isiWajib() {
  fireEvent.change(screen.getByPlaceholderText(/PT Sinar Jaya/), { target: { value: "PT Maju" } });
  const harga = screen.getAllByRole("textbox").find((el) => el.closest(".field")?.textContent?.includes("Harga jual"));
  fireEvent.change(harga as HTMLElement, { target: { value: "150000000" } });
}

describe("pilihan aset penjualan", () => {
  it("aset yang tidak bisa dijual tetap bisa dipilih, muncul info & simpan dikunci", async () => {
    tampil();
    await pilih("TR-02");

    expect(screen.getByRole("alert").textContent).toContain("karena unit sedang perbaikan");
    expect((screen.getByText("Simpan penjualan") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("TR-02"));
    fireEvent.click(await screen.findByText("TR-01"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByText("Simpan penjualan") as HTMLButtonElement).disabled).toBe(false);
  });

  it("aset Breakdown: tanya dulu sebelum dijual, insiden ditutup Selesai (terjual)", async () => {
    const onSubmit = tampil();
    await pilih("TR-03");
    isiWajib();

    fireEvent.click(screen.getByText("Simpan penjualan"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/Apakah Anda yakin mau menjual/)).toBeTruthy();
    expect(screen.getByText(/2 insiden/)).toBeTruthy();

    fireEvent.click(screen.getByText("Ya, jual"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ asset_id: "u3", harga_jual: 150_000_000 });
  });

  it("aset Standby langsung disimpan tanpa konfirmasi", async () => {
    const onSubmit = tampil();
    await pilih("TR-01");
    isiWajib();
    fireEvent.click(screen.getByText("Simpan penjualan"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Apakah Anda yakin mau menjual/)).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import * as unitsApi from "@/features/units/api";
import type { Incident } from "@/types";
import * as api from "../api";
import { BatalPenghapusanModal } from "./batal-penghapusan-modal";
import { PenghapusanFormModal } from "./penghapusan-form-modal";

function bungkus(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("form penghapusan", () => {
  function tampil() {
    vi.spyOn(api, "asetDihapusPilihan").mockResolvedValue([
      { id: "u1", kode: "TR-01", jenis_nama: "Lowbed", status: "breakdown", alasan_tidak_bisa: null, insiden_terbuka: 2 },
      {
        id: "u2",
        kode: "TR-02",
        jenis_nama: "Lowbed",
        status: "bertugas",
        alasan_tidak_bisa:
          "Tidak bisa menghapus unit TR-02 karena unit sedang bertugas (job JOB-7 belum selesai). Selesaikan atau batalkan job-nya dulu.",
        insiden_terbuka: 0
      }
    ]);
    const onSubmit = vi.fn().mockResolvedValue(true);
    bungkus(<PenghapusanFormModal open onClose={() => {}} onSubmit={onSubmit} busy={false} />);
    return onSubmit;
  }

  async function pilih(kode: string) {
    fireEvent.click(await screen.findByText("Pilih unit"));
    fireEvent.click(await screen.findByText(kode));
  }

  it("unit Bertugas bisa dipilih, tapi saat disimpan ditolak — selesaikan job dulu", async () => {
    const onSubmit = tampil();
    await pilih("TR-02");
    expect(screen.getByRole("alert").textContent).toContain("sedang bertugas");
    fireEvent.change(screen.getByPlaceholderText(/rusak berat/), { target: { value: "Rusak berat" } });
    fireEvent.click(screen.getByText("Simpan penghapusan"));
    expect(screen.queryByText(/Apakah Anda yakin menghapus/)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findAllByText(/Selesaikan atau batalkan job-nya dulu/)).toBeTruthy();
  });

  it("alasan wajib, lalu tanya dulu sebelum menghapus", async () => {
    const onSubmit = tampil();
    await pilih("TR-01");
    fireEvent.click(screen.getByText("Simpan penghapusan"));
    expect(screen.getByText("Alasan penghapusan wajib diisi")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/rusak berat/), { target: { value: "Rusak berat" } });
    fireEvent.click(screen.getByText("Simpan penghapusan"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/Apakah Anda yakin menghapus unit ini/)).toBeTruthy();
    expect(screen.getByText(/2 insiden yang belum selesai/)).toBeTruthy();

    fireEvent.click(screen.getByText("Ya, hapus"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ jenis_aset: "unit", asset_id: "u1", alasan: "Rusak berat" });
  });
});

describe("batalkan penghapusan", () => {
  const insiden = (over: Partial<Incident>): Incident => ({
    id: "i1",
    unit_id: "u1",
    tipe: "kerusakan",
    tanggal: "2026-09-26T03:30:00Z",
    deskripsi: "Mesin mati",
    status: "resolved",
    created_at: "2026-09-26T03:30:00Z",
    photos: [],
    ...over
  });

  it("alasan wajib; insiden yang ditutup saat dihapus dibuka lagi sesuai pilihan", async () => {
    vi.spyOn(unitsApi, "getUnitIncidents").mockResolvedValue([
      insiden({ id: "a", ditutup_karena: "diafkirkan", status_sebelum_ditutup: "in_progress" }),
      insiden({ id: "b", ditutup_karena: "diafkirkan", status_sebelum_ditutup: "open" }),
      insiden({ id: "c" }) // selesai biasa — tidak ikut
    ]);
    const onConfirm = vi.fn();
    bungkus(
      <BatalPenghapusanModal
        penghapusan={{
          id: "h1",
          nomor_berita_acara: "0001/BAP/MAS/IX/2026",
          aset: null,
          jenis_aset: "unit",
          unit_id: "u1",
          unit_trailer_id: null,
          kode_aset: "TR-01",
          tanggal_hapus: "2026-09-26",
          alasan: "Rusak",
          catatan: null,
          status_aset_sebelum: "breakdown",
          bukti_uploaded_at: null,
          bukti_url: null,
          created_by_nama: null,
          created_at: "2026-09-26T03:30:00Z"
        }}
        busy={false}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    const pilihan = await screen.findAllByRole("combobox");
    expect(pilihan).toHaveLength(2);
    fireEvent.click(screen.getByText("Ya, batalkan"));
    expect(screen.getByText("Alasan pembatalan wajib diisi")).toBeTruthy();

    fireEvent.change(pilihan[1], { target: { value: "in_progress" } });
    fireEvent.change(screen.getByPlaceholderText(/salah pilih/), { target: { value: "Salah pilih" } });
    fireEvent.click(screen.getByText("Ya, batalkan"));
    expect(onConfirm).toHaveBeenCalledWith("Salah pilih", [
      { id: "a", status: "in_progress" },
      { id: "b", status: "in_progress" }
    ]);
  });
});

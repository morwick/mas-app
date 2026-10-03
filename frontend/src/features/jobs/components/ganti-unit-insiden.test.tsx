/**
 * Ganti unit memakai insiden yang sudah terdaftar untuk job itu (mis. dari
 * operator): checkbox "Gunakan insiden yang sudah terdaftar" + detailnya.
 * Dicentang → kirim insiden_id tanpa isian insiden baru; tidak dicentang →
 * isian insiden baru seperti biasa. Skenario sukses, edge, dan gagal.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Incident, Job } from "@/types";

let insidenUnit: Incident[] = [];
const UNIT_STANDBY = { id: "u2", kode_unit: "TH02", is_active: true, status: "standby" };
const gantiUnit = vi.fn();

vi.mock("@/features/units/queries", () => ({
  useUnits: () => ({ data: [UNIT_STANDBY], isLoading: false }),
  useUnitIncidents: () => ({ data: insidenUnit })
}));
vi.mock("@/features/drivers/queries", () => ({ useDrivers: () => ({ data: [] }) }));
vi.mock("@/features/uang-jalan/queries", () => ({ useSumberDana: () => ({ data: [] }) }));
vi.mock("@/features/unit-trailer/queries", () => ({ useTrailerUntukUnit: () => ({ data: null, isLoading: false }) }));
vi.mock("@/features/tracking/api", () => ({ unitLocation: () => Promise.reject(new Error("tanpa GPS")) }));
vi.mock("../api", async (asli) => ({
  ...(await asli<typeof import("../api")>()),
  gantiUnit: (...args: unknown[]) => gantiUnit(...args)
}));

import { GantiUnitModal, insidenTerdaftarJob } from "./penggantian-modal";

const JOB = {
  id: "j1",
  job_number: "JOB-1",
  unit_id: "u1",
  driver_id: "d1",
  etd: "2026-10-03T01:00:00Z",
  uang_jalan_cair: 0
} as Job;

function insiden(over: Partial<Incident>): Incident {
  return {
    id: "i1",
    unit_id: "u1",
    job_id: "j1",
    tipe: "kerusakan",
    tanggal: "2026-10-03T02:00:00Z",
    lokasi: "KM 120",
    deskripsi: "Ban pecah",
    status: "open",
    created_by_nama: "Operator A",
    created_at: "2026-10-03T02:00:00Z",
    photos: [],
    ...over
  } as Incident;
}

function tampil() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <GantiUnitModal job={JOB} unitKode="TH01" onClose={() => {}} />
      </ToastProvider>
    </MemoryRouter>
  );
}

const CHECKBOX = "Gunakan insiden yang sudah terdaftar";

/** Isi unit pengganti, uang jalan, dan alasan (isian wajib selain insiden). */
function isiWajib() {
  fireEvent.click(screen.getByText("Pilih unit"));
  fireEvent.click(screen.getByText("TH02"));
  fireEvent.change(screen.getByPlaceholderText("2.500.000"), { target: { value: "1500000" } });
  fireEvent.change(screen.getByPlaceholderText("Mis. gardan patah di KM 120…"), { target: { value: "Unit mogok" } });
}

beforeEach(() => {
  insidenUnit = [];
  gantiUnit.mockReset();
  gantiUnit.mockResolvedValue({ ok: false, error: "berhenti di sini" });
});

describe("insidenTerdaftarJob", () => {
  it("sukses: insiden terbuka / dalam penanganan milik job ini", () => {
    const hasil = insidenTerdaftarJob(JOB, [insiden({ id: "a" }), insiden({ id: "b", status: "in_progress" })]);
    expect(hasil.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("edge: insiden job lain, sudah selesai, atau sudah dipakai ganti unit tidak ikut", () => {
    const hasil = insidenTerdaftarJob(JOB, [
      insiden({ id: "lain", job_id: "j9" }),
      insiden({ id: "tanpa-job", job_id: null }),
      insiden({ id: "selesai", status: "resolved" }),
      insiden({ id: "dipakai", dari_ganti_unit: true })
    ]);
    expect(hasil).toEqual([]);
  });
});

describe("GantiUnitModal — insiden terdaftar", () => {
  it("sukses: ada insiden job ini → checkbox tercentang, detail tampil, isian insiden baru disembunyikan", () => {
    insidenUnit = [insiden({})];
    tampil();
    const cek = screen.getByLabelText(CHECKBOX) as HTMLInputElement;
    expect(cek.checked).toBe(true);
    expect(screen.getByText("Ban pecah")).toBeTruthy();
    expect(screen.getByText(/dicatat Operator A/)).toBeTruthy();
    expect(screen.queryByText("Deskripsi insiden")).toBeNull();
  });

  it("edge: tidak ada insiden terdaftar → tanpa checkbox, isian insiden baru tampil", () => {
    insidenUnit = [insiden({ status: "resolved" })];
    tampil();
    expect(screen.queryByLabelText(CHECKBOX)).toBeNull();
    expect(screen.getByText("Deskripsi insiden")).toBeTruthy();
  });

  it("edge: checkbox dilepas → isian insiden baru muncul lagi", () => {
    insidenUnit = [insiden({})];
    tampil();
    fireEvent.click(screen.getByLabelText(CHECKBOX));
    expect(screen.getByText("Deskripsi insiden")).toBeTruthy();
    expect(screen.queryByText("Ban pecah")).toBeNull();
  });

  it("edge: lebih dari satu insiden → bisa memilih salah satu (radio)", () => {
    insidenUnit = [insiden({ id: "a" }), insiden({ id: "b", deskripsi: "Rem blong" })];
    tampil();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
    fireEvent.click(radios[1]);
    expect(radios[1].checked).toBe(true);
  });

  it("sukses: dicentang → yang dikirim insiden_id, tanpa isian insiden baru", async () => {
    insidenUnit = [insiden({ id: "a" }), insiden({ id: "b", deskripsi: "Rem blong" })];
    tampil();
    fireEvent.click(screen.getAllByRole("radio")[1]);
    isiWajib();
    fireEvent.submit(document.getElementById("ganti-unit-form")!);
    await waitFor(() => expect(gantiUnit).toHaveBeenCalledTimes(1));
    const [jobId, kirim] = gantiUnit.mock.calls[0];
    expect(jobId).toBe("j1");
    expect(kirim).toMatchObject({ insiden_id: "b", unit_id: "u2", uang_jalan_awal: 1500000, alasan: "Unit mogok" });
    expect(kirim).not.toHaveProperty("insiden_deskripsi");
    expect(kirim).not.toHaveProperty("insiden_tanggal");
  });

  it("sukses: dilepas → yang dikirim isian insiden baru, tanpa insiden_id", async () => {
    insidenUnit = [insiden({})];
    tampil();
    fireEvent.click(screen.getByLabelText(CHECKBOX));
    isiWajib();
    fireEvent.submit(document.getElementById("ganti-unit-form")!);
    await waitFor(() => expect(gantiUnit).toHaveBeenCalledTimes(1));
    const kirim = gantiUnit.mock.calls[0][1];
    expect(kirim).not.toHaveProperty("insiden_id");
    expect(kirim.insiden_deskripsi).toBe("Unit TH01 rusak saat menjalankan job JOB-1");
    expect(kirim.insiden_tanggal).toBeTruthy();
  });

  it("gagal: isian wajib (unit, uang jalan, alasan) kosong → tidak dikirim ke server", async () => {
    insidenUnit = [insiden({})];
    tampil();
    fireEvent.submit(document.getElementById("ganti-unit-form")!);
    expect(await screen.findByText("Pilih unit pengganti")).toBeTruthy();
    // Insiden terdaftar dipakai → tidak ada error isian insiden baru.
    expect(screen.queryByText("Deskripsi insiden wajib diisi")).toBeNull();
    await waitFor(() => expect(gantiUnit).not.toHaveBeenCalled());
  });

  it("gagal: checkbox dilepas & deskripsi insiden dikosongkan → error isian insiden baru", async () => {
    insidenUnit = [insiden({})];
    tampil();
    fireEvent.click(screen.getByLabelText(CHECKBOX));
    const deskripsi = screen.getByText("Deskripsi insiden").closest(".field")!.querySelector("textarea")!;
    fireEvent.change(deskripsi, { target: { value: "  " } });
    fireEvent.submit(document.getElementById("ganti-unit-form")!);
    expect(await screen.findByText("Deskripsi insiden wajib diisi")).toBeTruthy();
    expect(gantiUnit).not.toHaveBeenCalled();
  });
});

/**
 * Pilihan Unit Trailer di form job: tampil & wajib hanya bila jenis unit dari
 * unit yang dipilih punya jenis unit trailer; selain itu disembunyikan.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitTrailerField } from "./unit-trailer-field";

const PILIHAN = {
  wajib: true,
  trailer: [
    { id: "t1", kode_trailer: "TR-01", jenis_nama: "Lowbed 3 as", status: "standby" as const },
    { id: "t2", kode_trailer: "TR-02", jenis_nama: "Lowbed 3 as", status: "perbaikan" as const }
  ]
};

describe("UnitTrailerField", () => {
  it("disembunyikan bila unit tidak punya relasi jenis unit trailer", () => {
    const { container } = render(
      <UnitTrailerField pilihan={{ wajib: false, trailer: [] }} loading={false} value="" onChange={() => {}} />
    );
    expect(container.textContent).toBe("");
  });

  it("disembunyikan bila belum ada unit yang dipilih", () => {
    const { container } = render(<UnitTrailerField pilihan={undefined} loading={false} value="" onChange={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("tampil wajib dengan trailer yang cocok; hanya yang Standby bisa dipilih", () => {
    const onChange = vi.fn();
    render(<UnitTrailerField pilihan={PILIHAN} loading={false} value="" onChange={onChange} />);
    expect(screen.getByText("Unit trailer")).toBeTruthy();
    expect(screen.getByText("Unit ini wajib memakai unit trailer.")).toBeTruthy();
    fireEvent.click(document.querySelector(".combobox-trigger")!);
    const opsi = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(opsi.map((o) => o.textContent)).toEqual([
      expect.stringContaining("TR-01"),
      expect.stringContaining("Perbaikan — tidak bisa dipilih")
    ]);
    // Sama seperti unit: trailer yang tidak Standby tidak bisa dipakai job.
    fireEvent.click(opsi[1]);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(opsi[0]);
    expect(onChange).toHaveBeenCalledWith("t1");
  });

  it("trailer yang sedang dipakai job ini tetap bisa dipilih di form edit", () => {
    const onChange = vi.fn();
    const pilihan = {
      wajib: true,
      trailer: [{ id: "t3", kode_trailer: "TR-03", jenis_nama: "Lowbed", status: "bertugas" as const }]
    };
    render(
      <UnitTrailerField pilihan={pilihan} loading={false} value="" onChange={onChange} trailerJobIni="t3" />
    );
    fireEvent.click(document.querySelector(".combobox-trigger")!);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option"));
    expect(onChange).toHaveBeenCalledWith("t3");
  });

  it("wajib tapi belum ada trailer → petunjuk menambah di menu Unit Trailer", () => {
    render(<UnitTrailerField pilihan={{ wajib: true, trailer: [] }} loading={false} value="" onChange={() => {}} />);
    expect(screen.getByText(/Belum ada unit trailer untuk jenis unit ini/)).toBeTruthy();
  });

  it("menunjukkan sedang memeriksa saat pilihan dimuat", () => {
    render(<UnitTrailerField pilihan={undefined} loading value="" onChange={() => {}} />);
    expect(screen.getByText(/Memeriksa unit trailer/)).toBeTruthy();
  });
});

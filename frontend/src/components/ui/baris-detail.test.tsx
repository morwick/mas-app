/**
 * Baris tabel: klik 1 kali tidak apa-apa (supaya isi bisa disalin), klik 2
 * kali membuka detail, Ctrl + klik 2 kali tab baru, Enter, dan petunjuk hover.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KepalaKolomLihat, PETUNJUK_BARIS, TombolLihat, useBarisDetail } from "./baris-detail";

function Tabel({ aksi }: { aksi?: () => void }) {
  const barisDetail = useBarisDetail();
  return (
    <table>
      <tbody>
        <tr {...barisDetail(aksi ?? "/detail/1")}>
          <td>
            <TombolLihat tujuan={aksi ?? "/detail/1"} />
          </td>
          <td>INV-001</td>
          <td>
            <a href="/lain">tautan lain</a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const tampil = (aksi?: () => void) =>
  render(
    <MemoryRouter initialEntries={["/daftar"]}>
      <Routes>
        <Route path="/daftar" element={<Tabel aksi={aksi} />} />
        <Route path="/detail/1" element={<p>HALAMAN DETAIL</p>} />
      </Routes>
    </MemoryRouter>
  );

const baris = () => screen.getByText("INV-001").closest("tr") as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe("useBarisDetail", () => {
  it("klik 1 kali tidak pindah halaman; klik 2 kali membuka detail", () => {
    tampil();
    fireEvent.click(baris());
    expect(screen.queryByText("HALAMAN DETAIL")).toBeNull();
    fireEvent.doubleClick(baris());
    expect(screen.getByText("HALAMAN DETAIL")).toBeTruthy();
  });

  it("Ctrl + klik 2 kali membuka di tab baru", () => {
    const buka = vi.spyOn(window, "open").mockImplementation(() => null);
    tampil();
    fireEvent.doubleClick(baris(), { ctrlKey: true });
    expect(buka).toHaveBeenCalledWith("/detail/1", "_blank", "noopener");
    expect(screen.queryByText("HALAMAN DETAIL")).toBeNull();
  });

  it("Enter pada baris yang difokus membuka detail", () => {
    tampil();
    fireEvent.keyDown(baris(), { key: "Enter" });
    expect(screen.getByText("HALAMAN DETAIL")).toBeTruthy();
  });

  it("tujuan berupa aksi (mis. buka modal) dipanggil saat klik 2 kali", () => {
    const aksi = vi.fn();
    tampil(aksi);
    fireEvent.doubleClick(baris());
    expect(aksi).toHaveBeenCalledOnce();
  });

  it("klik 2 kali pada tautan di dalam baris tidak membuka detail baris", () => {
    tampil();
    fireEvent.doubleClick(screen.getByText("tautan lain"));
    expect(screen.queryByText("HALAMAN DETAIL")).toBeNull();
  });

  it("hover menampilkan petunjuk dan hilang saat kursor keluar", () => {
    tampil();
    fireEvent.mouseMove(baris(), { clientX: 100, clientY: 50 });
    const label = screen.getByText(PETUNJUK_BARIS);
    expect(label.style.display).toBe("block");
    fireEvent.mouseLeave(baris());
    expect(label.style.display).toBe("none");
  });

  it("ikon mata membuka detail dengan sekali klik", () => {
    tampil();
    fireEvent.click(screen.getByRole("link", { name: "Lihat detail" }));
    expect(screen.getByText("HALAMAN DETAIL")).toBeTruthy();
  });

  it("ikon mata untuk tujuan berupa aksi = tombol yang memanggil aksi", () => {
    const aksi = vi.fn();
    tampil(aksi);
    fireEvent.click(screen.getByRole("button", { name: "Lihat detail" }));
    expect(aksi).toHaveBeenCalledOnce();
  });

  it("kepala kolom ikon mata berisi ikon setting", () => {
    render(
      <table>
        <thead>
          <tr>
            <KepalaKolomLihat />
          </tr>
        </thead>
      </table>
    );
    const th = screen.getByRole("columnheader", { name: "Aksi" });
    expect(th.querySelector("svg.lucide-settings")).not.toBeNull();
  });
});

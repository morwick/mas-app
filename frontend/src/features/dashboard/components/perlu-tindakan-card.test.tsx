import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { DokumenJatuhTempoModal, PerluTindakanCard } from "./perlu-tindakan-card";

describe("kartu Perlu tindakan", () => {
  it("tidak dirender bila tidak ada tindakan", () => {
    const { container } = render(
      <MemoryRouter>
        <PerluTindakanCard items={[]} />
      </MemoryRouter>
    );
    expect(container.textContent).toBe("");
  });

  it("dokumen jatuh tempo tampil angka saja; rincian dibuka lewat klik", () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <PerluTindakanCard
          items={[
            { key: "a", to: "/jobs?tab=validasi", judul: "2 job menunggu validasi", keterangan: "Periksa foto" },
            { key: "dokumen", onClick, judul: "2 dokumen jatuh tempo", keterangan: "Klik untuk rincian." }
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Perlu tindakan")).toHaveLength(1);
    // Jumlah tindakan di header.
    expect(screen.getByRole("button", { name: /Perlu tindakan/ }).textContent).toContain("2");
    expect(screen.getByText("2 job menunggu validasi")).toBeTruthy();
    // Daftar dokumen tidak tampil di kartu.
    expect(screen.queryByText(/hari lagi/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2 dokumen jatuh tempo/ }));
    expect(onClick).toHaveBeenCalled();
  });

  it("modal dokumen: urut dari yang paling mendesak, tiap baris tertaut ke detailnya", () => {
    render(
      <MemoryRouter>
        <DokumenJatuhTempoModal
          open
          onClose={() => {}}
          dokumen={[
            { label: "KIR", subjek: "TL-01", href: "/unit-trailer/t1", tanggal: "2026-10-10", sisa_hari: 14 },
            { label: "STNK", subjek: "TR-01", href: "/units/u1", tanggal: "2026-09-20", sisa_hari: -6 }
          ]}
        />
      </MemoryRouter>
    );
    const tautan = screen.getAllByRole("link");
    expect(tautan[0].getAttribute("href")).toBe("/units/u1");
    expect(tautan[0].textContent).toContain("Sudah habis 6 hari");
    expect(tautan[1].getAttribute("href")).toBe("/unit-trailer/t1");
    expect(tautan[1].textContent).toContain("Habis 14 hari lagi");
  });

  it("modal dokumen: filter per jenis dokumen", () => {
    render(
      <MemoryRouter>
        <DokumenJatuhTempoModal
          open
          onClose={() => {}}
          dokumen={[
            { label: "STNK", subjek: "TR-01", href: "/units/u1", tanggal: "2026-10-01", sisa_hari: 5 },
            { label: "SIM", subjek: "Budi", href: "/drivers/d1/edit", tanggal: "2026-09-20", sisa_hari: -6 },
            { label: "Pajak kendaraan", subjek: "TR-02", href: "/units/u2", tanggal: "2026-10-10", sisa_hari: 14 }
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
    fireEvent.click(screen.getByText("Pajak").closest("button")!);
    const tautan = screen.getAllByRole("link");
    expect(tautan).toHaveLength(1);
    expect(tautan[0].textContent).toContain("TR-02");
    fireEvent.click(screen.getByText("KIR").closest("button")!);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/Tidak ada dokumen KIR/)).toBeTruthy();
  });

  it("bisa diminimize & di-expand lagi; pilihan diingat", () => {
    localStorage.clear();
    const tampil = () =>
      render(
        <MemoryRouter>
          <PerluTindakanCard
            items={[{ key: "a", to: "/jobs", judul: "2 job menunggu validasi", keterangan: "Periksa foto" }]}
          />
        </MemoryRouter>
      );
    const { unmount } = tampil();
    expect(screen.getByText("Periksa foto")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Perlu tindakan/ }));
    expect(screen.queryByText("Periksa foto")).toBeNull();
    // Saat terlipat, judul tindakan tetap terbaca ringkas di header.
    expect(screen.getByText("2 job menunggu validasi")).toBeTruthy();
    unmount();
    tampil();
    expect(screen.queryByText("Periksa foto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Perlu tindakan/ }));
    expect(screen.getByText("Periksa foto")).toBeTruthy();
    localStorage.clear();
  });
});

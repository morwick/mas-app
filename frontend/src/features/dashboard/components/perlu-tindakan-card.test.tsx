import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PerluTindakanCard, RincianDokumen } from "./perlu-tindakan-card";

describe("kartu Perlu tindakan", () => {
  it("tidak dirender bila tidak ada tindakan", () => {
    const { container } = render(
      <MemoryRouter>
        <PerluTindakanCard items={[]} />
      </MemoryRouter>
    );
    expect(container.textContent).toBe("");
  });

  it("satu kartu berisi semua tindakan, termasuk rincian dokumen", () => {
    render(
      <MemoryRouter>
        <PerluTindakanCard
          items={[
            { key: "a", to: "/jobs?tab=validasi", judul: "2 job menunggu validasi", keterangan: "Periksa foto" },
            {
              key: "b",
              to: "/units/u1",
              judul: "2 dokumen perlu diperpanjang",
              keterangan: "STNK / KIR",
              rincian: (
                <RincianDokumen
                  dokumen={[
                    { label: "STNK", subjek: "TR-01", href: "/units/u1", tanggal: "2026-09-20", sisa_hari: -6 },
                    { label: "KIR", subjek: "TL-01", href: "/unit-trailer/t1", tanggal: "2026-10-10", sisa_hari: 14 }
                  ]}
                />
              )
            }
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Perlu tindakan")).toHaveLength(1);
    // Jumlah tindakan di header.
    expect(screen.getByRole("button", { name: /Perlu tindakan/ }).textContent).toContain("2");
    expect(screen.getByText("2 job menunggu validasi")).toBeTruthy();
    expect(screen.getByText(/sudah habis 6 hari/)).toBeTruthy();
    expect(screen.getByText(/habis 14 hari lagi/)).toBeTruthy();
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

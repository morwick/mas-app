/**
 * Judul header "Menu / Halaman": halaman menu cukup nama menu; halaman lebih
 * dalam diberi jejak kecil yang bisa diklik. Skenario sukses, edge, gagal.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { bacaJejakAsal, jejakDariProyek, susunJudul } from "./judul-halaman";
import { TopBar } from "./top-bar";

vi.mock("./global-search", () => ({ GlobalSearch: () => null }));
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./profile-menu", () => ({ ProfileMenu: () => null }));

const ID = "3f2a9c1e-1234-4abc-9def-001122334455";

describe("susunJudul", () => {
  it("sukses: halaman menu → judul nama menu tanpa jejak", () => {
    expect(susunJudul("/quotations")).toEqual({ jejak: [], judul: "Penawaran" });
  });

  it("sukses: halaman detail → Penawaran / Detail Penawaran", () => {
    expect(susunJudul(`/quotations/${ID}`)).toEqual({
      jejak: [{ label: "Penawaran", href: "/quotations" }],
      judul: "Detail Penawaran"
    });
  });

  it("sukses: halaman tambah → Menu / Tambah Menu", () => {
    expect(susunJudul("/units/new")).toEqual({ jejak: [{ label: "Unit", href: "/units" }], judul: "Tambah Unit" });
  });

  it("sukses: halaman edit → cukup Menu / Edit Menu (tanpa jejak bertingkat)", () => {
    expect(susunJudul(`/jobs/${ID}/edit`)).toEqual({ jejak: [{ label: "Job", href: "/jobs" }], judul: "Edit Job" });
    expect(susunJudul(`/proyek/${ID}/edit`)).toEqual({
      jejak: [{ label: "Proyek", href: "/proyek" }],
      judul: "Edit Proyek"
    });
  });

  it("sukses: tambah job (form) → Proyek / Tambah Job; bagikan ke customer tetap di bawah detail job", () => {
    expect(susunJudul(`/proyek/${ID}/tambah-job`)).toEqual({
      jejak: [{ label: "Proyek", href: "/proyek" }],
      judul: "Tambah Job"
    });
    expect(susunJudul(`/jobs/${ID}/confirmation`).jejak.map((j) => j.label)).toEqual(["Job", "Detail Job"]);
    expect(susunJudul(`/jobs/${ID}/confirmation`).judul).toBe("Bagikan ke Customer");
  });

  it("edge: menu tanpa halaman detail → edit hanya berjejak menu", () => {
    expect(susunJudul(`/customers/${ID}/edit`)).toEqual({
      jejak: [{ label: "Customer", href: "/customers" }],
      judul: "Edit Customer"
    });
  });

  it("edge: sub-halaman bernama → Menu / Nama halaman", () => {
    expect(susunJudul("/proyek/per-unit")).toEqual({
      jejak: [{ label: "Proyek", href: "/proyek" }],
      judul: "Proyek per Unit"
    });
    expect(susunJudul("/reports/laba").judul).toBe("Laporan Laba");
    expect(susunJudul("/tracking/peta").judul).toBe("Peta Armada");
  });

  it("edge: perintah kerja di bawah menu Service", () => {
    expect(susunJudul(`/perintah-kerja/${ID}`)).toEqual({
      jejak: [{ label: "Service", href: "/services" }],
      judul: "Detail Perintah Kerja"
    });
    expect(susunJudul(`/perintah-kerja/${ID}/edit`)).toEqual({
      jejak: [{ label: "Service", href: "/services" }],
      judul: "Edit Perintah Kerja"
    });
  });

  it("edge: approval → jejak kembali ke daftar fitur itu", () => {
    expect(susunJudul("/approval/uang_jalan").jejak).toEqual([]);
    expect(susunJudul(`/approval/uang_jalan/${ID}`)).toEqual({
      jejak: [{ label: "Approval", href: "/approval/uang_jalan" }],
      judul: "Detail Pengajuan"
    });
  });

  it("gagal: halaman tak dikenal → judul MAS tanpa jejak", () => {
    expect(susunJudul("/tidak-ada")).toEqual({ jejak: [], judul: "MAS" });
  });
});

describe("TopBar — tampilan judul", () => {
  function tampil(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<TopBar />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("sukses: detail → jejak kecil bisa diklik + garis miring + judul besar", () => {
    tampil(`/quotations/${ID}`);
    const jejak = screen.getByRole("link", { name: "Penawaran" });
    expect(jejak.className).toBe("judul-jejak");
    expect(screen.getByText("/")).toBeTruthy();
    expect(screen.getByText("Detail Penawaran").className).toBe("h2");
  });

  it("sukses: klik jejak → pindah ke halaman menu", () => {
    tampil(`/quotations/${ID}`);
    fireEvent.click(screen.getByRole("link", { name: "Penawaran" }));
    expect(screen.getByText("Penawaran").className).toBe("h2");
    expect(screen.queryByText("/")).toBeNull();
  });

  it("edge: halaman menu → hanya judul besar, tanpa garis miring", () => {
    tampil("/quotations");
    expect(screen.getByText("Penawaran").className).toBe("h2");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Job dibuka dari detail proyek (asal halaman, tanpa database)", () => {
  const PROYEK = "9a8b7c6d-0000-4abc-9def-001122334455";
  const asal = jejakDariProyek(PROYEK).jejakAsal;

  it("sukses: detail job → Proyek / Detail Proyek / Detail Job", () => {
    expect(susunJudul(`/jobs/${ID}`, asal)).toEqual({
      jejak: [
        { label: "Proyek", href: "/proyek" },
        { label: "Detail Proyek", href: `/proyek/${PROYEK}` }
      ],
      judul: "Detail Job"
    });
  });

  it("edge: edit job (form) walau dibuka dari proyek → cukup Job / Edit Job", () => {
    expect(susunJudul(`/jobs/${ID}/edit`, asal)).toEqual({ jejak: [{ label: "Job", href: "/jobs" }], judul: "Edit Job" });
  });

  it("sukses: halaman bagikan setelah tambah job dari proyek → Proyek / Detail Proyek / Detail Job / Bagikan ke Customer", () => {
    const hasil = susunJudul(`/jobs/${ID}/confirmation`, asal);
    expect(hasil.jejak.map((j) => j.label)).toEqual(["Proyek", "Detail Proyek", "Detail Job"]);
    expect(hasil.judul).toBe("Bagikan ke Customer");
  });

  it("edge: job dibuka dari menu Job (tanpa asal) → Job / Detail Job", () => {
    expect(susunJudul(`/jobs/${ID}`).jejak.map((j) => j.label)).toEqual(["Job"]);
  });

  it("edge: asal tidak berlaku di halaman selain job", () => {
    expect(susunJudul("/proyek", asal)).toEqual({ jejak: [], judul: "Proyek" });
    expect(susunJudul("/jobs", asal)).toEqual({ jejak: [], judul: "Job" });
  });

  it("gagal: state router yang tidak sesuai diabaikan", () => {
    expect(bacaJejakAsal(null)).toBeUndefined();
    expect(bacaJejakAsal({ jejakAsal: [] })).toBeUndefined();
    expect(bacaJejakAsal({ jejakAsal: [{ href: "/x" }] })).toBeUndefined();
    expect(bacaJejakAsal({ lain: 1 })).toBeUndefined();
    expect(bacaJejakAsal(jejakDariProyek(PROYEK))).toEqual(asal);
  });

  it("sukses: header — klik Detail Proyek kembali ke proyek asal", () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: `/jobs/${ID}`, state: jejakDariProyek(PROYEK) }]}>
        <Routes>
          <Route path="/jobs/:id" element={<TopBar />} />
          <Route path="/proyek/:id" element={<div>Halaman detail proyek</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Detail Job").className).toBe("h2");
    expect(screen.getAllByText("/")).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: "Detail Proyek" }));
    expect(screen.getByText("Halaman detail proyek")).toBeTruthy();
  });
});

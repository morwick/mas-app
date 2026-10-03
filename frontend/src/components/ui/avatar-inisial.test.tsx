/** Foto profil inisial: dua kata pertama, huruf besar, aman untuk nama kosong. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarInisial, IkonPerusahaan, inisialNama, singkatanPerusahaan } from "./avatar-inisial";

describe("inisialNama", () => {
  it("dua kata pertama, huruf besar", () => {
    expect(inisialNama("budi santoso putra")).toBe("BS");
  });

  it("satu kata & spasi berlebih", () => {
    expect(inisialNama("  Siti   ")).toBe("S");
  });

  it("nama kosong → ?", () => {
    expect(inisialNama("   ")).toBe("?");
  });
});

describe("AvatarInisial", () => {
  it("hijau bila aktif, abu-abu bila redup", () => {
    const { rerender } = render(<AvatarInisial nama="Budi Santoso" />);
    expect(screen.getByText("BS").getAttribute("style")).toContain("var(--brand-primary)");
    rerender(<AvatarInisial nama="Budi Santoso" redup />);
    expect(screen.getByText("BS").getAttribute("style")).toContain("var(--text-tertiary)");
  });
});

describe("IkonPerusahaan", () => {
  it("singkatan tanpa awalan PT / CV", () => {
    expect(singkatanPerusahaan("PT Sumber Ban Jaya")).toBe("SB");
    expect(singkatanPerusahaan("cv. oli makmur")).toBe("OM");
    expect(singkatanPerusahaan("Asuransi Sinar Mas")).toBe("AS");
  });

  it("hijau muda bila aktif, abu-abu bila redup (nonaktif)", () => {
    const { rerender } = render(<IkonPerusahaan nama="PT Sumber Ban" />);
    expect(screen.getByText("SB").getAttribute("style")).toContain("var(--brand-primary-light)");
    rerender(<IkonPerusahaan nama="PT Sumber Ban" redup />);
    expect(screen.getByText("SB").getAttribute("style")).toContain("var(--bg-subtle)");
  });
});

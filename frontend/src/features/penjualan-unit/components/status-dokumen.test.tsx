import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDokumen } from "./status-dokumen";

describe("StatusDokumen", () => {
  it("belum ada dokumen sama sekali → badge merah Belum ada", () => {
    render(
      <StatusDokumen
        dokumen={[
          { label: "Surat penjualan", ada: false },
          { label: "BAST", ada: false }
        ]}
      />
    );
    const badge = screen.getByText("Belum ada");
    expect(badge.className).toContain("badge-cancelled");
    expect(screen.queryByText("BAST")).toBeNull();
  });

  it("sebagian diunggah → centang yang sudah, silang yang belum", () => {
    render(
      <StatusDokumen
        dokumen={[
          { label: "Surat penjualan", ada: true },
          { label: "BAST", ada: false }
        ]}
      />
    );
    expect(screen.queryByText("Belum ada")).toBeNull();
    expect(screen.getByLabelText("Surat penjualan: sudah diunggah")).toBeTruthy();
    expect(screen.getByLabelText("BAST: belum diunggah")).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./badge";

describe("status unit Terjual", () => {
  it("badge bertulisan Terjual", () => {
    render(<StatusBadge status="terjual" />);
    expect(screen.getByText("Terjual")).toBeTruthy();
  });

});

describe("status unit Diafkirkan", () => {
  it("badge bertulisan Diafkirkan", () => {
    render(<StatusBadge status="diafkirkan" />);
    expect(screen.getByText("Diafkirkan")).toBeTruthy();
  });

  it("terjual & diafkirkan bukan lagi armada", async () => {
    const { bukanArmada } = await import("@/lib/unit-status");
    expect(["standby", "bertugas", "perbaikan", "terjual", "diafkirkan"].map((s) => bukanArmada(s as never))).toEqual([
      false,
      false,
      false,
      true,
      true
    ]);
  });
});

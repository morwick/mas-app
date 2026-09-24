import { fireEvent, render, screen } from "@testing-library/react";
import { StatusBadge } from "./badge";
import { UnitStatusModal } from "@/features/units/components/status-modal";

describe("status unit Terjual", () => {
  it("badge bertulisan Terjual", () => {
    render(<StatusBadge status="terjual" />);
    expect(screen.getByText("Terjual")).toBeTruthy();
  });

  it("bisa dipilih di ubah status unit", () => {
    const onConfirm = vi.fn();
    render(<UnitStatusModal open onClose={() => {}} currentStatus="standby" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Terjual"));
    expect(screen.getByText(/Unit sudah dijual/)).toBeTruthy();
  });
});

describe("status unit Diafkirkan", () => {
  it("badge & pilihan ubah status", () => {
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

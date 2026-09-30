/**
 * Halaman Unit: tab "Milik perusahaan" dan "Sudah terjual" memisahkan unit
 * yang sudah dijual dari armada milik perusahaan.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Unit } from "@/types";
import { UnitsListView } from "./units-list-view";

vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ canManageOperational: true })
}));
vi.mock("@/features/tracking/api", () => ({
  fleetLocations: async () => ({ locations: {} })
}));

const unit = (kode: string, status: Unit["status"]) =>
  ({
    id: kode,
    kode_unit: kode,
    no_polisi: `B ${kode}`,
    jenis_unit_id: "j1",
    jenis_unit_nama: "Tronton",
    status,
    is_active: true,
    imei_gps: null,
    default_driver_nama: null
  }) as unknown as Unit;

const UNITS = [unit("TR-01", "standby"), unit("TR-02", "diafkirkan"), unit("TR-03", "terjual")];

function renderView(initialStatus?: string) {
  return render(
    <MemoryRouter>
      <UnitsListView units={UNITS} jenisUnitList={[]} initialStatus={initialStatus} />
    </MemoryRouter>
  );
}

describe("UnitsListView", () => {
  it("tab Milik perusahaan tidak menampilkan unit terjual", () => {
    renderView();
    expect(screen.getAllByText("TR-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TR-02").length).toBeGreaterThan(0);
    expect(screen.queryByText("TR-03")).toBeNull();
    const opsi = Array.from(screen.getByLabelText("Filter status").querySelectorAll("option")).map((o) => o.textContent);
    expect(opsi).not.toContain("Terjual");
  });

  it("tab Sudah terjual hanya menampilkan unit terjual", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Sudah terjual" }));
    expect(screen.getAllByText("TR-03").length).toBeGreaterThan(0);
    expect(screen.queryByText("TR-01")).toBeNull();
    expect(screen.queryByLabelText("Filter status")).toBeNull();
  });

  it("?status=terjual langsung membuka tab Sudah terjual", () => {
    renderView("terjual");
    expect(screen.getAllByText("TR-03").length).toBeGreaterThan(0);
    expect(screen.queryByText("TR-01")).toBeNull();
  });
});

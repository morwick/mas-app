/**
 * Form unit: pilihan driver tetap berupa dropdown yang bisa diketik, dan
 * driver yang sudah dipakai unit lain tetap tidak bisa dipilih.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { UnitForm } from "@/features/units/components/unit-form";
import type { Driver, JenisUnit } from "@/types";

const JENIS: JenisUnit[] = [
  { id: "j1", nama: "Lowbed", is_active: true },
  { id: "j2", nama: "Tronton", is_active: true }
];

const driver = (id: string, nama: string, no_hp: string): Driver => ({
  id,
  nama,
  no_hp,
  is_active: true,
  status: "stand_by",
  created_at: "2026-01-01T00:00:00Z"
});

const DRIVERS = [
  driver("d1", "Agus Salim", "0811"),
  driver("d2", "Budi Santoso", "0812"),
  driver("d3", "Cahyo", "0813")
];

function renderForm() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <UnitForm
          mode="new"
          jenisUnitList={JENIS}
          drivers={DRIVERS}
          driverAssignments={{ d2: { unit_id: "u-lain", kode_unit: "SL09" } }}
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

/** Tombol pemicu dropdown "Driver tetap" — combobox kedua di form (setelah Jenis unit). */
function bukaDropdownDriver() {
  const triggers = document.querySelectorAll<HTMLButtonElement>(".combobox-trigger");
  fireEvent.click(triggers[1]);
}

describe("UnitForm — dropdown driver", () => {
  it("bisa dicari dengan mengetik nama", () => {
    renderForm();
    bukaDropdownDriver();
    fireEvent.change(screen.getByPlaceholderText("Cari nama atau no HP driver…"), {
      target: { value: "cahyo" }
    });
    // Hanya opsi di daftar dropdown driver (form juga punya <select> Status awal).
    const opsi = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(opsi).toHaveLength(1);
    expect(opsi[0].textContent).toContain("Cahyo");
  });

  it("driver yang sudah dipakai unit lain tidak bisa dipilih", () => {
    renderForm();
    bukaDropdownDriver();
    const budi = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("Budi"))!;
    expect(budi.getAttribute("aria-disabled")).toBe("true");
    expect(budi.textContent).toContain("sudah di SL09");
  });
});

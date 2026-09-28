import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateTimeInput, formatTanggalInput } from "./datetime-input";

describe("DateTimeInput", () => {
  it("tanggal dd/mm/yyyy, jam 24 jam, berlabel WIB", () => {
    render(<DateTimeInput value="2026-09-26T18:05" onChange={() => {}} />);
    expect(screen.getByText("26/09/2026")).toBeTruthy();
    expect((screen.getByLabelText("Jam") as HTMLSelectElement).value).toBe("18");
    expect((screen.getByLabelText("Menit") as HTMLSelectElement).value).toBe("05");
    expect(screen.getByText("WIB")).toBeTruthy();
    expect(screen.queryByText(/AM|PM/)).toBeNull();
  });

  it("pilihan jam 00–23", () => {
    render(<DateTimeInput value="2026-09-26T08:00" onChange={() => {}} />);
    const opsi = [...(screen.getByLabelText("Jam") as HTMLSelectElement).options].map((o) => o.value);
    expect(opsi[0]).toBe("00");
    expect(opsi.at(-1)).toBe("23");
    expect(opsi).toHaveLength(24);
  });

  it("ubah jam mempertahankan tanggal & menit", () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026-09-26T08:30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Jam"), { target: { value: "21" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-26T21:30");
  });

  it("kosong: tampil placeholder, jam belum terisi", () => {
    render(<DateTimeInput value="" onChange={() => {}} />);
    expect(screen.getByText("dd/mm/yyyy")).toBeTruthy();
    expect((screen.getByLabelText("Jam") as HTMLSelectElement).value).toBe("");
  });

  it("formatTanggalInput", () => {
    expect(formatTanggalInput("2026-01-05")).toBe("05/01/2026");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateInput } from "./date-input";

describe("DateInput", () => {
  it("menampilkan dd/mm/yyyy", () => {
    render(<DateInput value="2026-01-05" onChange={() => {}} />);
    expect(screen.getByText("05/01/2026")).toBeTruthy();
  });

  it("kosong menampilkan placeholder dd/mm/yyyy", () => {
    render(<DateInput value="" onChange={() => {}} />);
    expect(screen.getByText("dd/mm/yyyy")).toBeTruthy();
  });

  it("clearable: tombol hapus mengosongkan nilai", () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-01-05" onChange={onChange} clearable />);
    fireEvent.click(screen.getByLabelText("Kosongkan tanggal"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

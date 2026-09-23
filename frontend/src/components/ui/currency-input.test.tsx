/**
 * Mask rupiah: tampilan bertitik dengan prefiks Rp, nilai keluar tetap digit
 * polos supaya yang tersimpan integer.
 */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CurrencyInput,
  formatDigits,
  toDigits
} from "@/components/ui/currency-input";

describe("toDigits", () => {
  it("membuang semua karakter selain angka", () => {
    expect(toDigits("Rp 2.500.000")).toBe("2500000");
    expect(toDigits("1a2b3c")).toBe("123");
    expect(toDigits("-500")).toBe("500");
    expect(toDigits("2,5")).toBe("25");
  });

  it("merapikan nol di depan tapi mempertahankan nol tunggal", () => {
    expect(toDigits("0005")).toBe("5");
    expect(toDigits("0")).toBe("0");
    expect(toDigits("")).toBe("");
  });

  it("membatasi panjang agar tetap di rentang aman Number", () => {
    const digits = toDigits("9".repeat(30));
    expect(digits).toHaveLength(15);
    expect(Number.isSafeInteger(Number(digits))).toBe(true);
  });
});

describe("formatDigits", () => {
  it("memberi pemisah ribuan gaya Indonesia", () => {
    expect(formatDigits("2500000")).toBe("2.500.000");
    expect(formatDigits("500")).toBe("500");
    expect(formatDigits("1000")).toBe("1.000");
  });

  it("kosong tetap kosong — bukan 'Rp 0'", () => {
    expect(formatDigits("")).toBe("");
  });
});

function Harness({ onPick }: { onPick?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <CurrencyInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onPick?.(v);
      }}
      placeholder="2.500.000"
    />
  );
}

function box() {
  return screen.getByPlaceholderText("2.500.000") as HTMLInputElement;
}

describe("CurrencyInput", () => {
  it("menampilkan prefiks Rp", () => {
    render(<Harness />);
    expect(screen.getByText("Rp")).toBeTruthy();
  });

  it("memformat saat diketik tapi mengirim digit polos", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    fireEvent.change(box(), { target: { value: "2500000" } });
    expect(onPick).toHaveBeenLastCalledWith("2500000");
    expect(box().value).toBe("2.500.000");
  });

  it("menerima tempelan teks berformat dan tetap mengeluarkan angka saja", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    fireEvent.change(box(), { target: { value: "Rp 1.750.000" } });
    expect(onPick).toHaveBeenLastCalledWith("1750000");
    expect(box().value).toBe("1.750.000");
  });

  it("menolak huruf dan tanda baca", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    fireEvent.change(box(), { target: { value: "12ab34" } });
    expect(onPick).toHaveBeenLastCalledWith("1234");
    expect(box().value).toBe("1.234");
  });

  it("nilai yang dikirim selalu bisa jadi integer", () => {
    const seen: string[] = [];
    render(<Harness onPick={(v) => seen.push(v)} />);

    for (const typed of ["5", "50", "500", "5.000", "50.000x"]) {
      fireEvent.change(box(), { target: { value: typed } });
    }
    for (const v of seen) {
      expect(v).toMatch(/^\d*$/);
      expect(Number.isInteger(Number(v))).toBe(true);
    }
    expect(seen.at(-1)).toBe("50000");
  });

  it("dikosongkan kembali ke string kosong, bukan nol", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.change(box(), { target: { value: "1000" } });
    fireEvent.change(box(), { target: { value: "" } });
    expect(onPick).toHaveBeenLastCalledWith("");
    expect(box().value).toBe("");
  });

  it("menjaga posisi kursor saat menyisip angka di tengah", () => {
    render(<Harness />);
    const el = box();
    el.focus();

    fireEvent.change(el, { target: { value: "2500000" } });
    expect(el.value).toBe("2.500.000");

    // Sisipkan "9" tepat setelah "2." → "29.500.000"; kursor harus di belakang 9.
    fireEvent.change(el, {
      target: { value: "29.500.000", selectionStart: 3 }
    });
    expect(el.value).toBe("29.500.000");
    expect(el.selectionStart).toBe(2);
  });
});

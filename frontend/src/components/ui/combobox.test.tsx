/**
 * Perilaku inti Combobox: mencari, memilih lewat mouse & keyboard, opsi
 * nonaktif, dan tombol kosongkan.
 */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "c1", label: "PT Anugerah Jaya", hint: "Surabaya" },
  { value: "c2", label: "PT Bumi Sentosa", hint: "Jakarta" },
  { value: "c3", label: "CV Karya Mandiri", hint: "Jakarta" },
  { value: "c4", label: "PT Nonaktif", disabled: true }
];

function Harness({
  initial = "",
  onPick
}: {
  initial?: string;
  onPick?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      value={value}
      onChange={(v) => {
        setValue(v);
        onPick?.(v);
      }}
      options={OPTIONS}
      placeholder="Pilih customer"
      clearable
    />
  );
}

/** Tombol pemicu — satu-satunya elemen ber-aria-haspopup="listbox". */
function trigger() {
  return document.querySelector<HTMLButtonElement>(".combobox-trigger")!;
}

function openList() {
  fireEvent.click(trigger());
  return screen.getByRole("listbox");
}

describe("Combobox", () => {
  it("menampilkan placeholder saat belum ada pilihan", () => {
    render(<Harness />);
    expect(screen.getByText("Pilih customer")).toBeTruthy();
  });

  it("menyaring opsi sesuai kata kunci, termasuk dari hint", () => {
    render(<Harness />);
    openList();
    const search = screen.getByPlaceholderText("Ketik untuk mencari…");

    fireEvent.change(search, { target: { value: "bumi" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option").textContent).toContain("PT Bumi Sentosa");

    // Hint ("Jakarta") juga jadi kata kunci.
    fireEvent.change(search, { target: { value: "jakarta" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("mencocokkan beberapa kata dalam urutan bebas", () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByPlaceholderText("Ketik untuk mencari…"), {
      target: { value: "surabaya anugerah" }
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("memilih opsi lewat klik", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    openList();
    fireEvent.click(screen.getByText("CV Karya Mandiri"));
    expect(onPick).toHaveBeenCalledWith("c3");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toContain("CV Karya Mandiri");
  });

  it("memilih lewat panah bawah + Enter", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    openList();
    const search = screen.getByPlaceholderText("Ketik untuk mencari…");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("c2");
  });

  it("melewati opsi nonaktif saat navigasi dan menolak kliknya", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    openList();

    fireEvent.click(screen.getByText("PT Nonaktif"));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();

    // Dari opsi pertama, tiga kali panah bawah akan melompati c4 dan kembali ke c1.
    const search = screen.getByPlaceholderText("Ketik untuk mencari…");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("c1");
  });

  it("Escape menutup daftar tanpa mengubah nilai", () => {
    const onPick = vi.fn();
    render(<Harness initial="c1" onPick={onPick} />);
    openList();
    fireEvent.keyDown(screen.getByPlaceholderText("Ketik untuk mencari…"), {
      key: "Escape"
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain("PT Anugerah Jaya");
  });

  it("tombol kosongkan mengembalikan nilai ke string kosong", () => {
    const onPick = vi.fn();
    render(<Harness initial="c1" onPick={onPick} />);
    fireEvent.click(screen.getByLabelText("Kosongkan pilihan"));
    expect(onPick).toHaveBeenCalledWith("");
    expect(screen.getByText("Pilih customer")).toBeTruthy();
    // Klik silang tidak boleh ikut membuka daftar.
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("menampilkan pesan kosong bila tidak ada yang cocok", () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByPlaceholderText("Ketik untuk mencari…"), {
      target: { value: "zzz" }
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Tidak ada hasil")).toBeTruthy();
  });

  it("menyembunyikan opsi sampai kata kunci mencapai minQueryLength", () => {
    render(
      <Combobox value="" onChange={() => {}} options={OPTIONS} minQueryLength={4} />
    );
    openList();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Ketik minimal 4 huruf/)).toBeTruthy();

    const search = screen.getByPlaceholderText("Ketik untuk mencari…");
    fireEvent.change(search, { target: { value: "bum" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    fireEvent.change(search, { target: { value: "bumi" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});

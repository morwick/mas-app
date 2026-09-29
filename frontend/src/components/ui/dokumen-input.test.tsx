import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formDenganDokumen } from "@/lib/api/client";
import { DOKUMEN_KOSONG, DOKUMEN_MAKS_BYTES, DokumenInput, cekFileDokumen } from "./dokumen-input";

const pdf = (nama = "sim.pdf", size = 10) => new File([new Uint8Array(size)], nama, { type: "application/pdf" });

describe("cekFileDokumen", () => {
  it("menerima PDF & gambar", () => {
    expect(cekFileDokumen(pdf())).toBeNull();
    expect(cekFileDokumen(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
  });

  it("menolak format lain, file kosong, dan file > 10 MB", () => {
    expect(cekFileDokumen(new File(["x"], "a.txt", { type: "text/plain" }))).toMatch(/Format file/);
    expect(cekFileDokumen(pdf("a.pdf", 0))).toMatch(/kosong/);
    expect(cekFileDokumen(pdf("a.pdf", DOKUMEN_MAKS_BYTES + 1))).toMatch(/10 MB/);
  });
});

describe("DokumenInput", () => {
  it("belum ada dokumen: tombol upload", () => {
    render(<DokumenInput nama="SIM" value={DOKUMEN_KOSONG} onChange={() => {}} />);
    expect(screen.getByText("Belum ada dokumen")).toBeTruthy();
    expect(screen.getByText("Upload SIM")).toBeTruthy();
  });

  it("memilih file valid mengisi nilai; file salah memberi pesan", () => {
    const onChange = vi.fn();
    const { container } = render(<DokumenInput nama="SIM" value={DOKUMEN_KOSONG} onChange={onChange} />);
    const input = container.querySelector('input[type="file"]')!;
    const file = pdf();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith({ file, hapus: false });

    onChange.mockClear();
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Format file harus/)).toBeTruthy();
  });

  it("dokumen tersimpan: bisa dilihat, diganti, atau dihapus", () => {
    const onChange = vi.fn();
    render(<DokumenInput nama="KIR" value={DOKUMEN_KOSONG} onChange={onChange} url="https://x/kir.pdf" />);
    expect(screen.getByText("Lihat dokumen KIR").closest("a")?.getAttribute("href")).toBe("https://x/kir.pdf");
    expect(screen.getByText("Ganti file")).toBeTruthy();
    fireEvent.click(screen.getByText("Hapus"));
    expect(onChange).toHaveBeenCalledWith({ file: null, hapus: true });
  });

  it("read-only: tanpa tombol ubah", () => {
    render(<DokumenInput nama="SIM" value={DOKUMEN_KOSONG} onChange={() => {}} url="https://x/s.pdf" disabled />);
    expect(screen.getByText("Lihat dokumen SIM")).toBeTruthy();
    expect(screen.queryByText("Ganti file")).toBeNull();
    expect(screen.queryByText("Hapus")).toBeNull();
  });
});

describe("formDenganDokumen", () => {
  it("isian di field data, hanya file yang ada yang ikut", () => {
    const file = pdf();
    const form = formDenganDokumen({ no_hp: "0812" }, { dokumen_sim: file, dokumen_lain: null });
    expect(JSON.parse(String(form.get("data")))).toEqual({ no_hp: "0812" });
    expect(form.get("dokumen_sim")).toBeInstanceOf(File);
    expect(form.has("dokumen_lain")).toBe(false);
  });
});

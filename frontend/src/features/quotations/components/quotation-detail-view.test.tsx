/**
 * Detail penawaran kedaluwarsa: draft yang lewat masa berlaku masih bisa
 * diubah / dihapus; penawaran terkirim yang kedaluwarsa tetap bisa diisi
 * keputusan per item.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Quotation } from "@/types";
import { QuotationDetailView } from "./quotation-detail-view";

const penawaran = (belum_dikirim: boolean) =>
  ({
    id: "q1",
    quote_number: "0840/SK/MAS/IX/2026",
    customer_id: "c1",
    customer_nama: "PT Hexindo",
    tanggal: "2026-09-01",
    berlaku_sampai: "2026-09-15",
    perihal: "Surat Penawaran",
    kota_terbit: "Pekanbaru",
    status: "kedaluwarsa",
    belum_dikirim,
    ppn_aktif: false,
    ppn_persen: 0,
    subtotal: 1_000_000,
    ppn_nominal: 0,
    total: 1_000_000,
    nilai_deal: 0,
    items: [],
    created_at: "2026-09-01T00:00:00Z"
  }) as unknown as Quotation;

function renderView(q: Quotation) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <QuotationDetailView quotation={q} jobs={[]} canDelete />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("QuotationDetailView — kedaluwarsa", () => {
  it("draft lewat masa berlaku: bisa diubah & dihapus, tidak bisa dikirim / diputuskan", () => {
    renderView(penawaran(true));
    expect(screen.getByText(/belum pernah dikirim\. Ubah tanggal Berlaku sampai/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ubah" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hapus" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tandai terkirim" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keputusan per item" })).toBeNull();
  });

  it("terkirim lewat masa berlaku: keputusan per item tetap bisa, tidak bisa diubah", () => {
    renderView(penawaran(false));
    expect(screen.getByRole("button", { name: "Keputusan per item" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
  });

  it("Cetak versi revisi: tanggal disimpan dulu, lalu halaman cetak dibuka", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const buka = vi.spyOn(window, "open").mockImplementation(() => tab as unknown as Window);
    const panggilan: { path: string; body: unknown }[] = [];
    localStorage.setItem(
      "mas_admin_session",
      JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        panggilan.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body ?? "null")) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    renderView({
      ...penawaran(false),
      status: "completed",
      items: [{ id: "i1", harga_revisi: 7_000_000, keputusan: "deal", diputuskan_at: "2026-09-20T03:00:00Z" }]
    } as unknown as Quotation);
    fireEvent.click(screen.getByRole("button", { name: "Cetak versi revisi" }));
    expect(screen.getByText(/Nomor surat tetap 0840\/SK\/MAS\/IX\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan & cetak" }));
    // Awal: tanggal revisi (20 Sep) + masa berlaku asli 14 hari → 4 Okt.
    await waitFor(() => expect(tab.location.href).toBe("/quotations/q1/cetak?versi=revisi"));
    expect(panggilan).toContainEqual({
      path: "/api/quotations/q1/surat-revisi",
      body: { tanggal: "2026-09-20", berlaku_sampai: "2026-10-04" }
    });
    buka.mockRestore();
    vi.unstubAllGlobals();
  });

  it("surat revisi sudah pernah dicetak → langsung ke halaman cetak, tanpa pilih tanggal", () => {
    renderView({
      ...penawaran(false),
      status: "completed",
      tanggal_revisi: "2026-09-20",
      items: [{ id: "i1", harga_revisi: 7_000_000, keputusan: "deal" }]
    } as unknown as Quotation);
    const tombol = screen.getByRole("button", { name: "Cetak versi revisi" });
    expect(tombol.closest("a")?.getAttribute("href")).toBe("/quotations/q1/cetak?versi=revisi");
    fireEvent.click(tombol);
    expect(screen.queryByText("Cetak surat versi revisi")).toBeNull();
  });

  it("tanpa revisi harga → tidak ada tombol Cetak versi revisi", () => {
    renderView(penawaran(false));
    expect(screen.queryByRole("button", { name: "Cetak versi revisi" })).toBeNull();
  });

  it("menampilkan pemutus item", () => {
    renderView({
      ...penawaran(false),
      status: "completed",
      items: [{ id: "i1", keputusan: "deal", diputuskan_oleh_nama: "Mega", dari: "Pekanbaru", tujuan: "Dumai" }]
    } as unknown as Quotation);
    expect(screen.getAllByText(/oleh Mega/).length).toBeGreaterThan(0);
  });

  it("panel biru revisi: tanggal surat revisi, berlaku sampai, dibuat oleh", () => {
    renderView({
      ...penawaran(false),
      status: "completed",
      berlaku_sampai: "2026-10-20",
      berlaku_sampai_asli: "2026-09-15",
      tanggal_revisi: "2026-10-05",
      revisi_dibuat_oleh_nama: "Rika",
      revisi_dibuat_at: "2026-10-05T03:00:00Z",
      items: [{ id: "i1", keputusan: "deal", harga_revisi: 7_000_000 }]
    } as unknown as Quotation);
    const panel = screen.getByRole("note", { name: "Revisi penawaran" });
    expect(panel.textContent).toContain("Penawaran ini direvisi");
    expect(panel.textContent).toContain("Surat revisi dikeluarkan");
    expect(panel.textContent).toMatch(/Rika/);
    // Kartu utama tetap memakai masa berlaku surat asli.
    expect(screen.getByText("15 Sep 2026")).toBeTruthy();
  });

  it("ada harga revisi tapi surat revisi belum dikeluarkan", () => {
    renderView({
      ...penawaran(false),
      status: "completed",
      items: [{ id: "i1", keputusan: "deal", harga_revisi: 7_000_000 }]
    } as unknown as Quotation);
    expect(screen.getByRole("note", { name: "Revisi penawaran" }).textContent).toContain("belum dikeluarkan");
  });

  it("tanpa revisi → tidak ada panel", () => {
    renderView(penawaran(false));
    expect(screen.queryByRole("note", { name: "Revisi penawaran" })).toBeNull();
  });
});

describe("QuotationDetailView — ringkasan biaya saat ada revisi", () => {
  it("tanpa revisi & item ditolak: total tidak dicoret", () => {
    renderView(penawaran(false));
    expect(screen.getAllByText("Rp 1.000.000").every((el) => el.style.textDecoration === "")).toBe(true);
  });

  it("subtotal, PPN 11%, total awal dicoret; angka baru di sampingnya", () => {
    const q = {
      ...penawaran(false),
      status: "terkirim",
      ppn_aktif: true,
      ppn_persen: 11,
      subtotal: 10_000_000,
      ppn_nominal: 1_100_000,
      total: 11_100_000,
      items: [
        {
          id: "i1",
          urutan: 1,
          dari: "Cilegon",
          tujuan: "Bekasi",
          qty: 1,
          satuan: "unit",
          harga_satuan: 10_000_000,
          subtotal: 10_000_000,
          harga_revisi: 8_000_000,
          harga_final: 8_000_000,
          subtotal_final: 8_000_000,
          keputusan: "deal"
        }
      ]
    } as unknown as Quotation;
    renderView(q);
    expect(screen.getByText("Rp 11.100.000").style.textDecoration).toBe("line-through");
    expect(screen.getByText("Rp 1.100.000").style.textDecoration).toBe("line-through");
    // Harga & total item yang direvisi: awal dicoret, "Rev : …" di bawahnya.
    expect(screen.getAllByText("Rev : Rp 8.000.000").length).toBe(2);
    const diTabel = screen.getAllByText("Rp 10.000.000").filter((el) => el.closest("td"));
    expect(diTabel.length).toBe(2);
    expect(diTabel.every((el) => el.style.textDecoration === "line-through")).toBe(true);
    // Angka baru: subtotal 8 jt, PPN 880 rb, total 8,88 jt.
    expect(screen.getByText("Rp 880.000")).toBeTruthy();
    expect(screen.getByText("Rp 8.880.000")).toBeTruthy();
  });
});

describe("QuotationDetailView — item ditolak", () => {
  it("baris item ditolak dicoret dan tidak ikut total", () => {
    const item = (id: string, dari: string, harga: number, keputusan: string) => ({
      id,
      urutan: 1,
      dari,
      tujuan: "Bekasi",
      qty: 1,
      satuan: "unit",
      harga_satuan: harga,
      subtotal: harga,
      harga_revisi: null,
      harga_final: harga,
      subtotal_final: harga,
      keputusan
    });
    const q = {
      ...penawaran(false),
      status: "terkirim",
      subtotal: 15_000_000,
      total: 15_000_000,
      items: [item("i1", "Cilegon", 10_000_000, "deal"), item("i2", "Serang", 5_000_000, "ditolak")]
    } as unknown as Quotation;
    renderView(q);
    expect((screen.getByText("Serang") as HTMLElement).style.textDecoration).toBe("line-through");
    expect((screen.getByText("Cilegon") as HTMLElement).style.textDecoration).toBe("");
    // Tanpa revisi harga: tidak ada baris "Rev :".
    expect(screen.queryByText(/^Rev :/)).toBeNull();
    // Total awal 15 jt dicoret; angka baru 10 jt (tanpa item ditolak).
    expect(screen.getAllByText("Rp 15.000.000").some((el) => el.style.textDecoration === "line-through")).toBe(true);
    expect(screen.getAllByText("Rp 10.000.000").length).toBeGreaterThan(0);
  });
});

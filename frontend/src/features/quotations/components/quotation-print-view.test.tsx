/**
 * Halaman cetak penawaran: setiap cetak dicatat dulu di log sistem; bila
 * pencatatan gagal, dialog print tidak dibuka.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Quotation } from "@/types";
import { QuotationPrintView } from "./quotation-print-view";

const q = {
  id: "q1",
  quote_number: "0840/SK/MAS/IX/2026",
  perihal: "Surat Penawaran",
  kota_terbit: "Pekanbaru",
  tanggal: "2026-09-01",
  customer_nama: "PT Hexindo",
  status: "terkirim",
  items: [],
  subtotal: 0,
  ppn_aktif: false,
  total: 0
} as unknown as Quotation;

let panggilan: { path: string; body: unknown }[];
let gagal: boolean;
let cetak: ReturnType<typeof vi.fn>;

beforeEach(() => {
  panggilan = [];
  gagal = false;
  cetak = vi.fn();
  vi.stubGlobal("print", cetak);
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      panggilan.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body ?? "null")) });
      return gagal
        ? new Response(JSON.stringify({ detail: "Butuh login" }), { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderView(revisi = false) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <QuotationPrintView quotation={q} revisi={revisi} />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("QuotationPrintView — pencatatan cetak", () => {
  it("tombol cetak mencatat dulu (versi revisi), lalu membuka dialog print", async () => {
    renderView(true);
    fireEvent.click(screen.getByRole("button", { name: /Cetak \/ Simpan PDF/ }));
    await waitFor(() => expect(cetak).toHaveBeenCalledTimes(1));
    expect(panggilan).toEqual([{ path: "/api/quotations/q1/cetak", body: { versi: "revisi" } }]);
  });

  it("pencatatan gagal → dialog print tidak dibuka", async () => {
    gagal = true;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Cetak \/ Simpan PDF/ }));
    await waitFor(() => expect(panggilan.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText(/Cetak dibatalkan/)).toBeTruthy());
    expect(cetak).not.toHaveBeenCalled();
  });

  it("cetak lewat menu browser (Ctrl+P) juga tercatat", async () => {
    renderView();
    window.dispatchEvent(new Event("beforeprint"));
    await waitFor(() => expect(panggilan).toEqual([{ path: "/api/quotations/q1/cetak", body: { versi: "asli" } }]));
  });
});

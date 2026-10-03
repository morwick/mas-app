/**
 * Isian Sales di Detail Pengiriman: pilih dari master (No HP ikut terisi),
 * ketik nama baru, atau kosongkan (job tanpa sales).
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SALES_KOSONG,
  SalesField,
  keSalesInput,
  validasiSales,
  type IsianSales
} from "@/features/sales/components/sales-field";

const SALES = [
  { id: "s1", nama: "Budi Santoso", no_hp: "081211112222" },
  { id: "s2", nama: "Ani", no_hp: null }
];

let terakhir: IsianSales = SALES_KOSONG;

function Harness() {
  const [v, setV] = useState<IsianSales>(SALES_KOSONG);
  terakhir = v;
  return <SalesField value={v} onChange={(p) => setV((s) => ({ ...s, ...p }))} errors={{}} />;
}

function renderField() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["sales"], SALES);
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>
  );
}

function bukaDanKetik(teks: string) {
  fireEvent.click(document.querySelector(".combobox-trigger")!);
  fireEvent.change(screen.getByPlaceholderText("Cari / ketik nama sales…"), { target: { value: teks } });
}

const noHp = () => screen.getByPlaceholderText("0812xxxxxxxx") as HTMLInputElement;

describe("SalesField", () => {
  it("memilih sales dari daftar mengisi No HP otomatis", () => {
    renderField();
    bukaDanKetik("budi");
    fireEvent.click(screen.getByText("Budi Santoso"));
    expect(noHp().value).toBe("081211112222");
    expect(keSalesInput(terakhir)).toEqual({ sales_id: "s1", sales_nama: "Budi Santoso", sales_no_hp: "081211112222" });
  });

  it("nama yang belum ada dipakai sebagai sales baru", () => {
    renderField();
    bukaDanKetik("Citra Lestari");
    fireEvent.click(screen.getByText('Tambah "Citra Lestari" sebagai sales baru'));
    expect(screen.getByText("Citra Lestari")).toBeTruthy();
    fireEvent.change(noHp(), { target: { value: "081299998888" } });
    expect(keSalesInput(terakhir)).toEqual({ sales_id: null, sales_nama: "Citra Lestari", sales_no_hp: "081299998888" });
  });

  it("tanpa sales: No HP nonaktif dan payload kosong", () => {
    renderField();
    expect(noHp().disabled).toBe(true);
    expect(keSalesInput(terakhir)).toEqual({ sales_id: null, sales_nama: null, sales_no_hp: null });
  });

  it("format No HP sales diperiksa", () => {
    expect(validasiSales({ ...SALES_KOSONG, sales_nama: "Ani", sales_no_hp: "12345" }).sales_no_hp).toMatch(/Format/);
    expect(validasiSales({ ...SALES_KOSONG, sales_nama: "Ani" })).toEqual({});
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Quotation, QuotationItem } from "@/types";
import { KeputusanItemModal } from "./keputusan-item-modal";

function item(id: string, extra: Partial<QuotationItem> = {}): QuotationItem {
  return {
    id,
    quotation_id: "q1",
    urutan: 1,
    dari: `Asal ${id}`,
    tujuan: `Tujuan ${id}`,
    qty: 2,
    satuan: "Unit",
    harga_satuan: 1_000_000,
    subtotal: 2_000_000,
    keputusan: "menunggu",
    harga_final: 1_000_000,
    subtotal_final: 2_000_000,
    jumlah_job: 0,
    ...extra
  };
}

const Q = { id: "q1", items: [item("a"), item("b"), item("c", { keputusan: "deal", jumlah_job: 1 })] } as unknown as Quotation;

function tampil() {
  render(
    <ToastProvider>
      <KeputusanItemModal quotation={Q} open onClose={() => {}} />
    </ToastProvider>
  );
}

describe("modal keputusan per item penawaran", () => {
  it("masih ada item menunggu → penawaran tetap terkirim", () => {
    tampil();
    expect(screen.getByText(/2 item masih menunggu/)).toBeTruthy();
  });

  it("deal dengan revisi harga menampilkan total baru & harga awal", () => {
    tampil();
    fireEvent.change(screen.getByLabelText("Keputusan item 1"), { target: { value: "deal" } });
    fireEvent.change(screen.getByLabelText("Harga revisi item 1"), { target: { value: "900000" } });
    expect(screen.getByText(/Total Rp\s1\.800\.000 \(awal Rp\s2\.000\.000\)/)).toBeTruthy();
  });

  it("item yang sudah dibuat job terkunci", () => {
    tampil();
    expect((screen.getByLabelText("Keputusan item 3") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/sudah dibuat 1 job/)).toBeTruthy();
  });

  it("semua ditolak (kecuali yang terkunci) → status mengikuti", () => {
    tampil();
    fireEvent.click(screen.getByText("Semua ditolak"));
    // Item 3 (deal, sudah ada job) tetap deal → penawaran Deal.
    expect(screen.getByText(/1 item deal, 2 ditolak/)).toBeTruthy();
  });
});

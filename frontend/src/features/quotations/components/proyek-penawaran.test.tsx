/**
 * Detail penawaran: satu baris per item penawaran & proyek — nomor item,
 * nomor proyek, kapan dibuat, dan oleh siapa. Daftar job tidak ditampilkan.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { QuotationItem, QuotationJobRef } from "@/types";
import { ProyekPenawaran } from "./proyek-penawaran";

const ITEMS = [{ id: "i1" }, { id: "i2" }] as unknown as QuotationItem[];

function job(id: string, item: string, proyek: string): QuotationJobRef {
  return {
    id,
    job_number: `JOB-${id}`,
    status: "ditugaskan",
    asal: "Gudang A",
    tujuan: "Site B",
    etd: "2026-10-01T01:00:00Z",
    quotation_item_id: item,
    proyek_id: proyek,
    proyek_nomor: `PRJ-${proyek}`,
    proyek_created_at: "2026-10-01T02:00:00Z",
    proyek_created_by_nama: "Admin Satu"
  };
}

describe("proyek dari penawaran", () => {
  it("satu baris per item & proyek, urut nomor item, tanpa daftar job", () => {
    render(
      <MemoryRouter>
        <ProyekPenawaran items={ITEMS} jobs={[job("1", "i2", "p1"), job("2", "i1", "p2"), job("3", "i1", "p2")]} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("PRJ-p2").length).toBe(1);
    expect(screen.getByText("PRJ-p1")).toBeTruthy();
    expect(screen.getAllByText("Admin Satu").length).toBe(2);
    expect(screen.queryByText("JOB-1")).toBeNull();
    const teks = document.body.textContent ?? "";
    expect(teks.indexOf("Item #1")).toBeLessThan(teks.indexOf("Item #2"));
  });
});

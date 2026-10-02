import { describe, expect, it } from "vitest";
import type { QuotationListRow } from "@/types";
import { pelaksanaan } from "./components/quotations-list-view";

const baris = (isi: Partial<QuotationListRow>) =>
  ({ jumlah_item: 3, jumlah_item_deal: 2, jumlah_job: 0, jumlah_job_selesai: 0, ...isi }) as QuotationListRow;

describe("Pelaksanaan penawaran: jumlah proyek yang terbentuk", () => {
  it("tanpa item deal → strip", () => {
    expect(pelaksanaan(baris({ jumlah_item_deal: 0 })).label).toBe("—");
  });

  it("belum ada proyek", () => {
    expect(pelaksanaan(baris({ jumlah_proyek: 0 })).label).toBe("Belum ada proyek");
  });

  it("jumlah proyek dari penawaran ini", () => {
    expect(pelaksanaan(baris({ jumlah_proyek: 2 })).label).toBe("2 proyek");
  });
});

/**
 * Helper tombol "Duplikat job sebelumnya": sumber = job terakhir proyek
 * (job dibatalkan dilewati); yang disalin alat, rute + koordinat, driver,
 * uang jalan, sales & No HP sales. Skenario sukses, edge, dan gagal.
 */

import { describe, expect, it } from "vitest";
import type { Job } from "@/types";
import { isiDariJob, jobTerakhir } from "./job-draft";

function job(over: Partial<Job>): Job {
  return {
    id: "j1",
    job_number: "JOB-1",
    status: "selesai",
    created_at: "2026-10-01T00:00:00Z",
    alat_diangkut: "Excavator",
    asal: "Gudang A",
    tujuan: "Proyek B",
    asal_lat: -6.1,
    asal_lng: 106.8,
    tujuan_lat: -6.9,
    tujuan_lng: 107.6,
    driver_id: "d1",
    unit_id: "u1",
    uang_jalan_awal: 2_500_000.4,
    sales_id: "s1",
    sales_nama: "Budi",
    sales_no_hp: "081277778888",
    ...over
  } as Job;
}

describe("jobTerakhir", () => {
  it("sukses: memilih job yang paling akhir dibuat", () => {
    const hasil = jobTerakhir([
      job({ id: "a", created_at: "2026-10-01T00:00:00Z" }),
      job({ id: "c", created_at: "2026-10-03T00:00:00Z" }),
      job({ id: "b", created_at: "2026-10-02T00:00:00Z" })
    ]);
    expect(hasil?.id).toBe("c");
  });

  it("edge: job dibatalkan yang lebih baru dilewati", () => {
    const hasil = jobTerakhir([
      job({ id: "a", created_at: "2026-10-01T00:00:00Z" }),
      job({ id: "batal", status: "cancelled", created_at: "2026-10-05T00:00:00Z" })
    ]);
    expect(hasil?.id).toBe("a");
  });

  it("gagal: tidak ada job / semua dibatalkan → tidak ada sumber", () => {
    expect(jobTerakhir([])).toBeNull();
    expect(jobTerakhir([job({ status: "cancelled" })])).toBeNull();
  });
});

describe("isiDariJob", () => {
  it("sukses: alat, rute + koordinat, driver, uang jalan, sales & No HP sales tersalin", () => {
    expect(isiDariJob(job({}))).toEqual({
      alat_diangkut: "Excavator",
      asal: "Gudang A",
      tujuan: "Proyek B",
      asal_lat: -6.1,
      asal_lng: 106.8,
      tujuan_lat: -6.9,
      tujuan_lng: 107.6,
      driver_id: "d1",
      uang_jalan_awal: "2500000",
      sales_id: "s1",
      sales_nama: "Budi",
      sales_no_hp: "081277778888"
    });
  });

  it("edge: job tanpa sales / koordinat / uang jalan → isian kosong, bukan undefined", () => {
    const isi = isiDariJob(
      job({ sales_id: null, sales_nama: null, sales_no_hp: null, asal_lat: undefined, uang_jalan_awal: null })
    );
    expect(isi.sales_id).toBe("");
    expect(isi.sales_nama).toBe("");
    expect(isi.sales_no_hp).toBe("");
    expect(isi.asal_lat).toBeNull();
    expect(isi.uang_jalan_awal).toBe("");
  });

  it("edge: jadwal, unit, catatan tidak ikut disalin", () => {
    const isi = isiDariJob(job({ etd: "2026-10-01T01:00:00Z", catatan: "rahasia" } as Partial<Job>));
    expect(isi).not.toHaveProperty("etd");
    expect(isi).not.toHaveProperty("unit_id");
    expect(isi).not.toHaveProperty("catatan");
  });
});

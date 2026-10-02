/**
 * Tab "Proyek siap ditagih": job dikelompokkan per proyek — alat unik digabung,
 * jumlah job dari backend (tanpa yang batal), urut yang paling lama menunggu.
 */
import type { JobBelumDitagihRow } from "@/types";
import { kelompokkanPerProyek } from "./proyek-siap-tagih-view";

function job(id: string, proyek: string, alat: string, selesai: string, jumlah: number): JobBelumDitagihRow {
  return {
    id,
    job_number: `JOB-${id}`,
    asal: "A",
    tujuan: "B",
    alat_diangkut: alat,
    etd: selesai,
    completed_at: selesai,
    uang_jalan_total: 0,
    uang_jalan_cair: 0,
    surat_jalan_urls: [],
    surat_jalan_loading_urls: [],
    surat_jalan_unloading_urls: [],
    uang_jalan_awal: 0,
    uang_jalan_transaksi: [],
    proyek_id: proyek,
    proyek_nomor: `PRJ-${proyek}`,
    proyek_jumlah_job: jumlah
  };
}

describe("kelompokkanPerProyek", () => {
  it("satu baris per proyek dengan alat unik, jumlah job, dan semua job id", () => {
    const rows = kelompokkanPerProyek(
      {
        c1: [
          job("1", "p1", "Excavator", "2026-10-02T00:00:00Z", 3),
          job("2", "p1", "Excavator", "2026-10-03T00:00:00Z", 3),
          job("3", "p1", "Bulldozer", "2026-10-04T00:00:00Z", 3)
        ],
        c2: [job("4", "p2", "Crane", "2026-09-01T00:00:00Z", 1)]
      },
      { c1: "PT A", c2: "PT B" }
    );
    expect(rows.map((r) => r.proyekNomor)).toEqual(["PRJ-p2", "PRJ-p1"]);
    const p1 = rows[1];
    expect(p1.alat).toBe("Excavator, Bulldozer");
    expect(p1.jumlahJob).toBe(3);
    expect(p1.jobIds).toEqual(["1", "2", "3"]);
    expect(p1.customerNama).toBe("PT A");
  });
});

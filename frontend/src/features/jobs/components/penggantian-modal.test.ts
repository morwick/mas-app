/**
 * "Selesaikan job dengan unit lain" di detail job: hanya untuk job Selesai
 * karena ganti unit yang semua job penggantinya dibatalkan.
 */
import { describe, expect, it } from "vitest";
import type { GantiTrukEntry } from "../api";
import { penggantiBatalDariRiwayat } from "./penggantian-modal";

function riwayat(over: Partial<GantiTrukEntry>): GantiTrukEntry {
  return {
    id: "r1",
    jenis: "ganti_unit",
    diganti_pada: "2026-10-01T00:00:00Z",
    status_job_saat_ganti: "perjalanan",
    alasan: "Unit rusak",
    unit_lama_kode: "TH01",
    unit_baru_kode: "TH02",
    driver_lama_nama: null,
    driver_baru_nama: null,
    unit_trailer_lama_kode: null,
    unit_trailer_baru_kode: null,
    diganti_oleh_nama: null,
    uang_jalan_dikembalikan: 0,
    kasbon: 0,
    job_pengganti_id: "j2",
    job_pengganti_number: "JOB-2026-002",
    job_pengganti_status: "cancelled",
    ...over
  };
}

describe("penggantiBatalDariRiwayat", () => {
  it("job selesai + pengganti dibatalkan → nomor pengganti", () => {
    expect(penggantiBatalDariRiwayat({ status: "selesai" }, [riwayat({})])).toEqual(["JOB-2026-002"]);
  });

  it("pengganti masih berjalan → kosong", () => {
    expect(penggantiBatalDariRiwayat({ status: "selesai" }, [riwayat({ job_pengganti_status: "perjalanan" })])).toEqual([]);
  });

  it("job belum selesai / tanpa job pengganti → kosong", () => {
    expect(penggantiBatalDariRiwayat({ status: "ditugaskan" }, [riwayat({})])).toEqual([]);
    expect(penggantiBatalDariRiwayat({ status: "selesai" }, [riwayat({ jenis: "ganti_driver", job_pengganti_id: null })])).toEqual([]);
  });
});

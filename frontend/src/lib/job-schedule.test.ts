import { describe, expect, it } from "vitest";
import {
  ETA_BEFORE_ETD_MESSAGE,
  ETD_BACKDATE_MESSAGE,
  isBackDated,
  isEtaBeforeEtd,
  minEtdValue,
  todayLocalDate,
  validateSchedule
} from "@/lib/job-schedule";

// Jam 14:30 supaya jelas bahwa yang dibandingkan tanggal, bukan instan.
const NOW = new Date(2026, 8, 23, 14, 30); // 23 Sep 2026, waktu lokal

describe("todayLocalDate & minEtdValue", () => {
  it("memakai tanggal lokal, bukan UTC", () => {
    // 1 Jan 2026 00:30 lokal — di UTC masih 31 Des 2025 untuk zona timur.
    expect(todayLocalDate(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });

  it("min ETD adalah awal hari ini", () => {
    expect(minEtdValue(NOW)).toBe("2026-09-23T00:00");
  });
});

describe("isBackDated", () => {
  it("menolak tanggal kemarin", () => {
    expect(isBackDated("2026-09-22T23:59", NOW)).toBe(true);
  });

  it("menerima jam yang sudah lewat asal masih hari ini", () => {
    expect(isBackDated("2026-09-23T06:00", NOW)).toBe(false);
  });

  it("menerima hari ini dan besok", () => {
    expect(isBackDated("2026-09-23T14:30", NOW)).toBe(false);
    expect(isBackDated("2026-09-24T00:00", NOW)).toBe(false);
  });

  it("mengabaikan nilai kosong", () => {
    expect(isBackDated("", NOW)).toBe(false);
  });
});

describe("isEtaBeforeEtd", () => {
  it("menolak ETA sebelum ETD", () => {
    expect(isEtaBeforeEtd("2026-09-24T10:00", "2026-09-24T09:59")).toBe(true);
    expect(isEtaBeforeEtd("2026-09-24T10:00", "2026-09-23T23:00")).toBe(true);
  });

  it("menerima ETA sama persis atau sesudah ETD", () => {
    expect(isEtaBeforeEtd("2026-09-24T10:00", "2026-09-24T10:00")).toBe(false);
    expect(isEtaBeforeEtd("2026-09-24T10:00", "2026-09-24T10:01")).toBe(false);
    expect(isEtaBeforeEtd("2026-09-24T10:00", "2026-10-01T08:00")).toBe(false);
  });

  it("melewati pemeriksaan bila ETA kosong (diisi sistem dari durasi rute)", () => {
    expect(isEtaBeforeEtd("2026-09-24T10:00", "")).toBe(false);
  });

  it("membandingkan lintas tahun dengan benar", () => {
    expect(isEtaBeforeEtd("2026-12-31T23:00", "2027-01-01T02:00")).toBe(false);
    expect(isEtaBeforeEtd("2027-01-01T02:00", "2026-12-31T23:00")).toBe(true);
  });
});

describe("validateSchedule", () => {
  it("tidak mengeluh untuk jadwal yang sah", () => {
    expect(
      validateSchedule("2026-09-24T08:00", "2026-09-24T17:00", { now: NOW })
    ).toEqual({});
  });

  it("melaporkan kedua pelanggaran sekaligus", () => {
    const errs = validateSchedule("2026-09-01T08:00", "2026-08-30T10:00", { now: NOW });
    expect(errs.etd).toBe(ETD_BACKDATE_MESSAGE);
    expect(errs.eta).toBe(ETA_BEFORE_ETD_MESSAGE);
  });

  it("melewati cek back-date saat diminta (edit job berjalan)", () => {
    const errs = validateSchedule("2026-09-01T08:00", "2026-09-02T10:00", {
      checkBackDate: false,
      now: NOW
    });
    expect(errs).toEqual({});
  });

  it("tetap menjaga urutan ETA walau back-date dilewati", () => {
    const errs = validateSchedule("2026-09-01T08:00", "2026-08-31T10:00", {
      checkBackDate: false,
      now: NOW
    });
    expect(errs.etd).toBeUndefined();
    expect(errs.eta).toBe(ETA_BEFORE_ETD_MESSAGE);
  });
});

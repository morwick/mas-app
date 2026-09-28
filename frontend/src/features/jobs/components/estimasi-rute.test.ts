import { describe, expect, it } from "vitest";
import { etaDariDurasi, formatDurasi } from "./estimasi-rute";

describe("formatDurasi", () => {
  it("menit, jam, dan hari", () => {
    expect(formatDurasi(45)).toBe("45 menit");
    expect(formatDurasi(120)).toBe("2 jam");
    expect(formatDurasi(609)).toBe("10 jam 9 menit");
    expect(formatDurasi(1500)).toBe("1 hari 1 jam");
    expect(formatDurasi(0.2)).toBe("1 menit");
  });
});

describe("etaDariDurasi", () => {
  it("ETD + durasi, dibulatkan ke atas per menit", () => {
    expect(etaDariDurasi("2026-10-01T08:00", 609)).toBe("2026-10-01T18:09");
    expect(etaDariDurasi("2026-10-01T20:00", 240.2)).toBe("2026-10-02T00:01");
  });

  it("ETD kosong → null", () => {
    expect(etaDariDurasi("", 60)).toBeNull();
  });
});

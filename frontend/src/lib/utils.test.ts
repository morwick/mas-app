import { describe, expect, it } from "vitest";
import { formatWaktuWIB } from "@/lib/utils";

describe("formatWaktuWIB", () => {
  it("format Y-m-d H:i:s di WIB (UTC+7), dari waktu UTC server", () => {
    expect(formatWaktuWIB("2026-09-24T01:05:09.123456+00:00")).toBe("2026-09-24 08:05:09");
  });

  it("ganti tanggal mengikuti WIB, bukan UTC", () => {
    expect(formatWaktuWIB("2026-09-24T18:30:00Z")).toBe("2026-09-25 01:30:00");
  });

  it("tengah malam ditulis 00, bukan 24", () => {
    expect(formatWaktuWIB("2026-09-24T17:00:00Z")).toBe("2026-09-25 00:00:00");
  });

  it("kosong atau tidak valid → tanda strip", () => {
    expect(formatWaktuWIB(null)).toBe("-");
    expect(formatWaktuWIB("bukan tanggal")).toBe("-");
  });
});

import { describe, expect, it } from "vitest";
import { computeRange } from "./ReportsPages";

describe("rentang laporan utilisasi (WIB)", () => {
  it("custom: dari 00:00 WIB s/d akhir hari 'sampai' (inklusif)", () => {
    const { start, end } = computeRange("custom", "2026-09-01", "2026-09-30");
    expect(start.toISOString()).toBe("2026-08-31T17:00:00.000Z"); // 1 Sep 00:00 WIB
    expect(end.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 1 Okt 00:00 WIB
  });

  it("bulan lalu dihitung dari tanggal WIB, termasuk dini hari tanggal 1", () => {
    // 1 Okt 2026 05:00 WIB — di UTC masih 30 Sep.
    const now = new Date("2026-10-01T05:00:00+07:00");
    const { start, end } = computeRange("month_prev", undefined, undefined, now);
    expect(start.toISOString()).toBe("2026-08-31T17:00:00.000Z"); // 1 Sep WIB
    expect(end.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 1 Okt WIB
  });
});

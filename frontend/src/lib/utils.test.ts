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

describe("jam input datetime-local", () => {
  it("dikirim dengan offset zona browser, tanggal & jam lokal tidak berubah", async () => {
    const { localInputToIso } = await import("@/lib/utils");
    const iso = localInputToIso("2026-09-26T06:30");
    expect(iso.startsWith("2026-09-26T06:30:00")).toBe(true);
    expect(iso).toMatch(/[+-]\d{2}:\d{2}$/);
    // Menunjuk momen yang sama dengan jam lokal yang diketik.
    expect(new Date(iso).getTime()).toBe(new Date("2026-09-26T06:30").getTime());
  });

  it("bolak-balik ISO server → input → ISO tetap momen yang sama", async () => {
    const { isoToLocalInput, localInputToIso } = await import("@/lib/utils");
    const server = "2026-09-26T03:30:00.000Z";
    expect(new Date(localInputToIso(isoToLocalInput(server))).getTime()).toBe(new Date(server).getTime());
  });

  it("null → kosong; kosong tetap kosong", async () => {
    const { isoToLocalInput, localInputToIso } = await import("@/lib/utils");
    expect(isoToLocalInput(null)).toBe("");
    expect(localInputToIso("")).toBe("");
  });
});

describe("timeAgo", () => {
  it("tidak pernah minus — waktu di masa depan tampil 'Baru saja'", async () => {
    const { timeAgo } = await import("@/lib/utils");
    expect(timeAgo(new Date(Date.now() + 5 * 3600_000))).toBe("Baru saja");
    expect(timeAgo(new Date(Date.now() - 2 * 3600_000))).toBe("2 jam lalu");
  });
});

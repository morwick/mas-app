import { describe, expect, it } from "vitest";
import { bolehGantiTruk } from "./ganti-truk-modal";

describe("bolehGantiTruk", () => {
  it("hanya saat job di perjalanan", () => {
    for (const s of ["loading", "dalam_perjalanan", "unloading"] as const)
      expect(bolehGantiTruk({ status: s })).toBe(true);
    for (const s of ["ditugaskan", "diterima", "serah_terima_pool", "menunggu_validasi", "selesai", "cancelled"] as const)
      expect(bolehGantiTruk({ status: s })).toBe(false);
  });
});

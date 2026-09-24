import { describe, expect, it } from "vitest";
import { periksaKapasitas, periksaTahun } from "./unit-trailer-form-modal";

describe("periksaTahun", () => {
  it("kosong boleh", () => expect(periksaTahun("")).toEqual({ nilai: null }));
  it("4 digit dalam rentang diterima", () => expect(periksaTahun("2020").nilai).toBe(2020));
  it.each(["20a0", "202", "20200", "1800", "2999", "2020.5"])("%s ditolak", (t) => {
    expect(periksaTahun(t).error).toMatch(/^Tahun tidak valid/);
  });
});

describe("periksaKapasitas", () => {
  it("kosong boleh", () => expect(periksaKapasitas("")).toEqual({ nilai: null }));
  it.each([
    ["40", 40],
    ["40,5", 40.5],
    ["40.25", 40.25]
  ])("%s diterima", (t, n) => expect(periksaKapasitas(t).nilai).toBe(n));
  it.each(["abc", "-5", "0", "12,345", "1e3", "40 ton"])("%s ditolak", (t) => {
    expect(periksaKapasitas(t).error).toMatch(/^Kapasitas muatan tidak valid/);
  });
});

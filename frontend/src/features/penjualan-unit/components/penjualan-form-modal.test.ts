import { emailValid, noHpValid } from "./penjualan-form-modal";

describe("validasi kontak pembeli", () => {
  it("no HP 8–15 digit, boleh +, spasi, tanda hubung", () => {
    expect(noHpValid("081234567890")).toBe(true);
    expect(noHpValid("+62 812-3456-7890")).toBe(true);
    expect(noHpValid("(021) 555 1234")).toBe(true);
    expect(noHpValid("0812")).toBe(false);
    expect(noHpValid("budi@maju.co.id")).toBe(false);
  });

  it("email berbentuk nama@domain", () => {
    expect(emailValid("budi@maju.co.id")).toBe(true);
    expect(emailValid("budi@maju")).toBe(false);
    expect(emailValid("081234567890")).toBe(false);
  });
});

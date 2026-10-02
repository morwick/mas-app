/** Kunci scroll di <html> (bukan <body>) dan aman bila bertumpuk. */
import { kunciScroll } from "./kunci-scroll";

describe("kunciScroll", () => {
  it("mengunci <html>, bukan <body>, lalu mengembalikan seperti semula", () => {
    const lepas = kunciScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    lepas();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("bertumpuk: scroll baru dilepas setelah kunci terakhir dilepas", () => {
    const modal = kunciScroll();
    const konfirmasi = kunciScroll();
    konfirmasi();
    expect(document.documentElement.style.overflow).toBe("hidden");
    konfirmasi(); // dilepas dua kali tidak mengacaukan hitungan
    expect(document.documentElement.style.overflow).toBe("hidden");
    modal();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

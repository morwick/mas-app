import { describe, expect, it } from "vitest";
import { parseLokasiInput } from "./lokasi-input";

function koordinat(teks: string) {
  const r = parseLokasiInput(teks);
  if (r.kind !== "koordinat") throw new Error(`bukan koordinat: ${r.kind}`);
  return [Number(r.lat.toFixed(4)), Number(r.lng.toFixed(4))];
}

describe("parseLokasiInput — koordinat", () => {
  it("desimal dipisah koma / spasi", () => {
    expect(koordinat("-6.2088, 106.8456")).toEqual([-6.2088, 106.8456]);
    expect(koordinat("-6.2088 106.8456")).toEqual([-6.2088, 106.8456]);
    expect(koordinat(" -6.2088,106.8456 ")).toEqual([-6.2088, 106.8456]);
  });

  it("format DMS dari Google Maps", () => {
    expect(koordinat(`6°12'31.7"S 106°50'44.2"E`)).toEqual([-6.2088, 106.8456]);
  });

  it("di luar jangkauan atau tanpa desimal dianggap teks", () => {
    expect(parseLokasiInput("95.1, 106.8").kind).toBe("teks");
    expect(parseLokasiInput("Blok 12 45").kind).toBe("teks");
    expect(parseLokasiInput("Pelabuhan Tanjung Priok").kind).toBe("teks");
  });
});

describe("parseLokasiInput — link Google Maps", () => {
  it("titik tempat !3d!4d diutamakan dari pusat peta @", () => {
    expect(
      koordinat(
        "https://www.google.com/maps/place/Monas/@-6.1753924,106.8245779,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-6.1753871!4d106.8271528"
      )
    ).toEqual([-6.1754, 106.8272]);
  });

  it("pusat peta @ bila tidak ada titik tempat", () => {
    expect(koordinat("https://www.google.co.id/maps/@-6.2,106.81,15z")).toEqual([-6.2, 106.81]);
  });

  it("parameter q / query / ll", () => {
    expect(koordinat("https://maps.google.com/?q=-6.2088,106.8456")).toEqual([-6.2088, 106.8456]);
    expect(koordinat("https://www.google.com/maps/search/?api=1&query=-6.2088%2C106.8456")).toEqual([
      -6.2088, 106.8456
    ]);
    expect(koordinat("https://maps.google.com/maps?ll=-6.2,106.8&z=10")).toEqual([-6.2, 106.8]);
  });

  it("path /maps/search/<lat>,+<lng>", () => {
    expect(koordinat("https://www.google.com/maps/search/-6.2088,+106.8456?entry=tts")).toEqual([
      -6.2088, 106.8456
    ]);
  });

  it("link pendek diteruskan ke backend", () => {
    expect(parseLokasiInput("https://maps.app.goo.gl/AbCdEf123")).toEqual({
      kind: "link-pendek",
      url: "https://maps.app.goo.gl/AbCdEf123"
    });
    expect(parseLokasiInput("maps.app.goo.gl/AbCdEf123").kind).toBe("link-pendek");
    expect(parseLokasiInput("https://goo.gl/maps/xyz").kind).toBe("link-pendek");
  });

  it("link tanpa koordinat membawa nama tempat", () => {
    expect(parseLokasiInput("https://maps.google.com/?q=Pelabuhan+Tanjung+Priok")).toEqual({
      kind: "link-tanpa-koordinat",
      query: "Pelabuhan Tanjung Priok"
    });
    expect(parseLokasiInput("https://www.google.com/maps/place/Monas+Jakarta")).toEqual({
      kind: "link-tanpa-koordinat",
      query: "Monas Jakarta"
    });
  });

  it("link bukan Google tidak dianggap link peta", () => {
    expect(parseLokasiInput("https://google.evil.com/maps/@-6.2,106.8,15z").kind).toBe("teks");
  });
});

/**
 * Halaman customer: lokasi unit butuh verifikasi (captcha TrackSolid) →
 * kartu lokasi meminta kode verifikasi tanpa menyebut TrackSolid / sesi;
 * kode benar → peta tampil.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tracking-map", () => ({
  TrackingMap: (p: { address: string | null }) => <div>peta:{p.address}</div>
}));

import { TrackSolidEmbed } from "./tracksolid-embed";

let perluVerifikasi: boolean;
let batasKiriman: boolean;
let kiriman: unknown[];

beforeEach(() => {
  perluVerifikasi = true;
  batasKiriman = false;
  kiriman = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      const lokasi = { lat: -0.5, lng: 101.4, address: "Jl. Soekarno Hatta, Pekanbaru", fetched_at: "2026-09-30T03:00:00Z" };
      if (path.endsWith("/track/tok/location"))
        return perluVerifikasi
          ? json({ detail: "Sesi TrackSolid tidak valid", kode: "tracksolid_captcha" }, 502)
          : json(lokasi);
      if (path.endsWith("/track/tok/verifikasi")) return json({ id: "c1", gambar: "data:image/jpeg;base64,abc" });
      if (path.endsWith("/track/tok/verifikasi/kirim")) {
        kiriman.push(JSON.parse(String(init?.body)));
        if (batasKiriman) return json({ detail: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." }, 429);
        perluVerifikasi = false;
        return json(lokasi);
      }
      return json({});
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderEmbed() {
  render(<TrackSolidEmbed jobToken="tok" externalLink={null} jobStatus="dalam_perjalanan" route={null} />);
}

describe("verifikasi lokasi oleh customer", () => {
  it("minta kode verifikasi tanpa istilah teknis; kode benar → peta tampil", async () => {
    renderEmbed();
    expect(await screen.findByText("Tampilkan lokasi akurat unit")).toBeTruthy();
    await screen.findByAltText("Kode verifikasi");
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/tracksolid|captcha|sesi/);

    fireEvent.change(screen.getByLabelText("Kode verifikasi"), { target: { value: " ab12 " } });
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan lokasi" }));
    expect(await screen.findByText("peta:Jl. Soekarno Hatta, Pekanbaru")).toBeTruthy();
    expect(kiriman).toEqual([{ id: "c1", kode: "ab12" }]);
  });

  it("terlalu banyak percobaan → pesan jelas, tanpa istilah teknis", async () => {
    batasKiriman = true;
    renderEmbed();
    await screen.findByAltText("Kode verifikasi");
    fireEvent.change(screen.getByLabelText("Kode verifikasi"), { target: { value: "ab12" } });
    fireEvent.click(screen.getByRole("button", { name: "Tampilkan lokasi" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
    );
    await waitFor(() => expect(document.body.textContent?.toLowerCase()).not.toMatch(/tracksolid|captcha/));
  });
});

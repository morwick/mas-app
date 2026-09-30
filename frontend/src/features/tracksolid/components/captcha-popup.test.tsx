/**
 * Popup captcha TrackSolid:
 *   * dibuka hanya oleh halaman ber-data TrackSolid (useSesiTrackSolid) saat
 *     cek sesi menyatakan butuh captcha;
 *   * halaman lain (mis. Laporan) yang kebetulan menerima galat captcha
 *     tidak memunculkan popup;
 *   * selama butuh captcha, permintaan lokasi TIDAK dikirim ke server;
 *   * login berhasil → popup tertutup, permintaan lokasi jalan lagi.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { fleetLocations } from "@/features/tracking/api";
import { dengarTersambung, sedangButuhCaptcha, tandaiSesiValid } from "@/lib/tracksolid-captcha";
import { useSesiTrackSolid } from "../use-sesi-tracksolid";
import { CaptchaPopup } from "./captcha-popup";

const JUDUL = "Sesi TrackSolid perlu login ulang";
let sesiValid: boolean;
let panggilanLokasi: number;
let pindah: (path: string) => void;

function Navigasi() {
  const navigate = useNavigate();
  pindah = (path) => navigate(path);
  return null;
}

function HalamanUnit() {
  useSesiTrackSolid();
  return <p>halaman unit</p>;
}

beforeEach(() => {
  tandaiSesiValid();
  sesiValid = false;
  panggilanLokasi = 0;
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path.endsWith("/tracksolid/sesi")) return json({ perlu_captcha: !sesiValid });
      if (path.endsWith("/tracking/units/locations")) {
        panggilanLokasi += 1;
        return sesiValid
          ? json({ locations: {} })
          : json({ detail: "Sesi TrackSolid tidak valid", kode: "tracksolid_captcha" }, 502);
      }
      if (path.endsWith("/tracksolid/captcha")) return json({ gambar: "data:image/jpeg;base64,abc" });
      if (path.endsWith("/tracksolid/login")) {
        sesiValid = true;
        return json({ ok: true });
      }
      return json({});
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderApp(halaman: React.ReactNode, path = "/units") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Navigasi />
        {halaman}
        <CaptchaPopup />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("CaptchaPopup", () => {
  it("halaman Unit: cek sesi → popup; permintaan lokasi berhenti; login → jalan lagi", async () => {
    const tersambung = vi.fn();
    const lepas = dengarTersambung(tersambung);
    renderApp(<HalamanUnit />);
    expect(await screen.findByText(JUDUL)).toBeTruthy();
    // Selama butuh captcha, tidak ada request lokasi ke server.
    await expect(fleetLocations()).rejects.toThrow();
    await expect(fleetLocations()).rejects.toThrow();
    expect(panggilanLokasi).toBe(0);

    await screen.findByAltText("Captcha TrackSolid");
    fireEvent.change(screen.getByLabelText("Kode captcha"), { target: { value: "ab12" } });
    fireEvent.click(screen.getByRole("button", { name: "Login TrackSolid" }));
    await waitFor(() => expect(screen.queryByText(JUDUL)).toBeNull());
    expect(tersambung).toHaveBeenCalledTimes(1);
    expect(sedangButuhCaptcha()).toBe(false);
    await expect(fleetLocations()).resolves.toEqual({ locations: {} });
    expect(panggilanLokasi).toBe(1);
    lepas();
  });

  it("cek /sesi bilang valid, tapi token ternyata ditolak saat data diminta → popup muncul", async () => {
    let cekSesi = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
        if (path.endsWith("/tracksolid/sesi")) {
          cekSesi += 1;
          return json({ perlu_captcha: false }); // database belum tahu tokennya kedaluwarsa
        }
        if (path.endsWith("/tracking/units/locations")) {
          panggilanLokasi += 1;
          return json({ detail: "Sesi TrackSolid tidak valid", kode: "tracksolid_captcha" }, 502);
        }
        if (path.endsWith("/tracksolid/captcha")) return json({ gambar: "data:image/jpeg;base64,abc" });
        return json({});
      })
    );
    renderApp(<HalamanUnit />);
    await waitFor(() => expect(cekSesi).toBe(1));
    expect(screen.queryByText(JUDUL)).toBeNull();
    // Halaman meminta lokasi → backend membalas "butuh captcha".
    await expect(fleetLocations()).rejects.toThrow();
    expect(await screen.findByText(JUDUL)).toBeTruthy();
    // Polling berikutnya tidak dikirim.
    await expect(fleetLocations()).rejects.toThrow();
    expect(panggilanLokasi).toBe(1);
  });

  it("halaman tanpa TrackSolid (mis. Laporan): galat captcha tidak memunculkan popup, request berikutnya berhenti", async () => {
    renderApp(<p>laporan</p>, "/reports");
    await expect(fleetLocations()).rejects.toThrow();
    expect(panggilanLokasi).toBe(1);
    await expect(fleetLocations()).rejects.toThrow();
    expect(panggilanLokasi).toBe(1);
    expect(screen.queryByText(JUDUL)).toBeNull();
  });

  it("ditutup → tombol pengingat membuka lagi; pindah halaman → tombol hilang", async () => {
    renderApp(<HalamanUnit />);
    await screen.findByText(JUDUL);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(JUDUL)).toBeNull());
    const tombol = screen.getByRole("button", { name: /TrackSolid butuh captcha — Isi sekarang/ });
    fireEvent.click(tombol);
    expect(await screen.findByText(JUDUL)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(JUDUL)).toBeNull());
    act(() => pindah("/dashboard"));
    expect(screen.queryByRole("button", { name: /Isi sekarang/ })).toBeNull();
  });
});

/**
 * Link tracking customer: job dibatalkan saat halaman sedang terbuka →
 * begitu poller lokasi menerima 410, halaman langsung memeriksa ulang dan
 * pindah ke "Link tracking sudah berakhir".
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Peta diganti tombol yang mensimulasikan poller lokasi menerima 410.
vi.mock("@/features/tracking/components/tracksolid-embed", () => ({
  TrackSolidEmbed: (p: { onBerakhir?: () => void }) => (
    <button type="button" onClick={() => p.onBerakhir?.()}>
      poller-410
    </button>
  )
}));
vi.mock("@/features/tracking/components/map-fullscreen-button", () => ({
  MapFullscreenButton: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import { CustomerTrackingPage, TrackingExpiredPage } from "./TrackPages";

const DATA = {
  job: {
    id: "job-1",
    job_number: "JOB-2026-020",
    share_token: "tok",
    status: "dalam_perjalanan",
    photos: [],
    asal: "Gudang A",
    tujuan: "Proyek B",
    alat_diangkut: "Excavator"
  },
  unit: { kode_unit: "TR-01", no_polisi: "BM 1", jenis: "Lowbed", tracksolid_share_link: null },
  driver: null,
  selesai: false,
  berlaku_sampai: null
};

let dibatalkan: boolean;

beforeEach(() => {
  dibatalkan = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/track/tok"))
        return dibatalkan
          ? new Response(JSON.stringify({ detail: "Link tracking sudah berakhir" }), { status: 410 })
          : new Response(JSON.stringify(DATA), { status: 200 });
      return new Response("{}", { status: 404 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("link tracking saat job dibatalkan", () => {
  it("halaman terbuka langsung pindah ke 'berakhir'", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/track/tok"]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/track/:token" element={<CustomerTrackingPage />} />
            <Route path="/track/:token/expired" element={<TrackingExpiredPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const poller = await screen.findByRole("button", { name: "poller-410" });
    // Admin membatalkan job; poller lokasi menerima 410.
    dibatalkan = true;
    poller.click();
    expect(await screen.findByText("Link tracking sudah berakhir")).toBeTruthy();
  });
});

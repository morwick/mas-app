import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/jobs/api", () => ({
  estimasiRute: vi.fn(async () => ({
    distance_km: 1868.6,
    duration_min: 2580,
    truk: true,
    laut: [{ nama: "Surabaya - Banjarmasin", distance_km: 491.6, duration_min: 1440 }]
  }))
}));

import { EstimasiRuteInfo } from "./estimasi-rute";

describe("EstimasiRuteInfo — rute menyeberang pulau", () => {
  it("memisahkan jalur darat dan penyeberangan laut", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EstimasiRuteInfo
          asal={{ lat: -6.2, lng: 106.8 }}
          tujuan={{ lat: -1.2, lng: 116.8 }}
          etd=""
          onPakaiEta={() => {}}
        />
      </QueryClientProvider>
    );
    expect(await screen.findByText(/Laut \(kapal ferry: Surabaya – Banjarmasin\)/)).toBeTruthy();
    expect(screen.getByText(/491,6 km · ± 1 hari/)).toBeTruthy();
    // Darat = total − laut: 1.377 km, 19 jam.
    expect(screen.getByText(/Darat: 1\.377 km · ± 19 jam/)).toBeTruthy();
    expect(screen.getByText(/antre & jadwal kapal/)).toBeTruthy();
  });
});

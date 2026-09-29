import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/types";
import { customerStep } from "@/lib/job-status";

vi.mock("@/features/tracking/components/tracksolid-embed", () => ({
  TrackSolidEmbed: (p: { jobStatus: string }) => <div>peta:{p.jobStatus}</div>
}));
vi.mock("@/features/tracking/components/map-fullscreen-button", () => ({
  MapFullscreenButton: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import { CustomerTrackingView } from "./customer-tracking-view";

const JOB = {
  id: "job-1",
  job_number: "JOB-2026-020",
  share_token: "tok",
  status: "serah_terima_pool",
  eta: "2026-09-28T10:00:00Z",
  photos: [],
  asal: "Gudang A",
  tujuan: "Proyek B",
  alat_diangkut: "Excavator"
} as unknown as Job;
const UNIT = { kode_unit: "TR-01", no_polisi: "BM 1", jenis: "Lowbed", tracksolid_share_link: "https://ts/x" };

describe("halaman tracking customer", () => {
  it("serah terima pool & menunggu validasi = selesai bagi customer", () => {
    expect(customerStep("serah_terima_pool")).toBe("selesai");
    expect(customerStep("menunggu_validasi")).toBe("selesai");
    expect(customerStep("unloading")).toBe("unloading");
  });

  it("setelah unloading tuntas: tampil selesai, peta berhenti, link berlaku sampai +24 jam", () => {
    render(
      <CustomerTrackingView
        job={JOB}
        unit={UNIT}
        driver={null}
        selesai
        berlakuSampai="2026-09-29T03:00:00.000Z"
      />
    );
    expect(screen.getByText("Pengiriman selesai")).toBeTruthy();
    expect(screen.getByText("SELESAI")).toBeTruthy();
    expect(screen.getByText("peta:selesai")).toBeTruthy();
    expect(screen.queryByText(/Buka peta/)).toBeNull();
    expect(screen.getByText(/Link ini bisa dibuka sampai 29 Sep 2026.*10\.00 WIB/)).toBeTruthy();
  });

  it("selama pengiriman: LIVE dan tombol buka peta tetap ada", () => {
    render(<CustomerTrackingView job={{ ...JOB, status: "dalam_perjalanan" } as Job} unit={UNIT} driver={null} />);
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByText(/Buka peta/)).toBeTruthy();
  });
});

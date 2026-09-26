/**
 * Detail unit trailer: isi & perilaku sama dengan detail unit — status, tab
 * job / riwayat status / insiden, dokumen KIR & SRUT, dan ubah status.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { Incident, UnitStatusHistoryEntry } from "@/types";
import type { UnitTrailer } from "../api";
import { UnitTrailerDetailView } from "./unit-trailer-detail-view";

vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({ canManageOperational: true })
}));

const TRAILER: UnitTrailer = {
  id: "t1",
  kode_trailer: "TL-01",
  tahun: 2020,
  jenis_unit_trailer_id: "j1",
  jenis_nama: "Lowbed 3 as",
  jenis_unit_nama: "Lowbed",
  kapasitas_ton: 40,
  status: "breakdown",
  kir_nomor: "KIR-123",
  kir_berlaku_sampai: "2099-01-31",
  srut_nomor: "SRUT-9",
  srut_tanggal: "2020-05-01",
  is_active: true
};

const INSIDEN: Incident = {
  id: "i1",
  unit_trailer_id: "t1",
  tipe: "kerusakan",
  tanggal: "2026-09-26T03:30:00Z",
  deskripsi: "As roda patah",
  status: "open",
  created_at: "2026-09-26T03:30:00Z",
  photos: []
};

const RIWAYAT: UnitStatusHistoryEntry[] = [
  {
    id: "h1",
    unit_id: "t1",
    status_old: "standby",
    status_new: "breakdown",
    changed_by_nama: "Admin",
    changed_at: "2026-09-26T03:31:00Z",
    reason: "Insiden kerusakan dicatat"
  }
];

let panggilan: { method: string; url: URL; body: unknown }[];
// Jumlah riwayat trailer — penentu tombol Hapus / Nonaktifkan.
let riwayat = { job: 0, insiden: 0, service: 0, penjualan: 0, penghapusan: 0, bisa_dihapus: true };

beforeEach(() => {
  panggilan = [];
  riwayat = { job: 0, insiden: 0, service: 0, penjualan: 0, penghapusan: 0, bisa_dihapus: true };
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      panggilan.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const daftar = url.pathname.endsWith("/jenis") || url.pathname.endsWith("/jenis-unit");
      const isi = url.pathname.endsWith("/riwayat") ? riwayat : daftar ? [] : { ok: true };
      return new Response(JSON.stringify(isi), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function tampil(trailer: UnitTrailer = TRAILER) {
  render(
    <MemoryRouter initialEntries={["/unit-trailer/t1?tab=insiden"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <UnitTrailerDetailView trailer={trailer} jobs={[]} history={RIWAYAT} incidents={[INSIDEN]} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("UnitTrailerDetailView", () => {
  it("menampilkan status, dokumen KIR & SRUT, dan insiden trailer", () => {
    tampil();
    expect(screen.getByText("TL-01")).toBeTruthy();
    expect(screen.getByText("KIR-123")).toBeTruthy();
    expect(screen.getByText("SRUT-9")).toBeTruthy();
    expect(screen.getByText("tanggal terbit")).toBeTruthy();
    expect(screen.getByText("As roda patah")).toBeTruthy();
    expect(screen.getByText("1 insiden belum selesai")).toBeTruthy();
  });

  it("riwayat status tampil seperti di detail unit", () => {
    tampil();
    fireEvent.click(screen.getByText("Riwayat status"));
    expect(screen.getByText("Insiden kerusakan dicatat")).toBeTruthy();
  });

  it("tanpa riwayat: tombol Hapus (hapus bersih) mengirim DELETE", async () => {
    tampil();
    fireEvent.click(await screen.findByText("Hapus unit trailer"));
    expect(screen.getByText(/seakan-akan unit trailer ini tidak pernah ada/)).toBeTruthy();
    expect(screen.queryByText("Nonaktifkan unit trailer")).toBeNull();
    fireEvent.click(screen.getByText("Ya, hapus bersih"));
    await waitFor(() =>
      expect(panggilan.some((p) => p.method === "DELETE" && p.url.pathname.endsWith("/unit-trailer/t1"))).toBe(true)
    );
  });

  it("sudah punya riwayat: tombol Hapus hilang, diganti Nonaktifkan", async () => {
    riwayat = { job: 3, insiden: 1, service: 0, penjualan: 0, penghapusan: 0, bisa_dihapus: false };
    tampil();
    fireEvent.click(await screen.findByText("Nonaktifkan unit trailer"));
    expect(screen.queryByText("Hapus unit trailer")).toBeNull();
    fireEvent.click(screen.getByText("Ya, nonaktifkan"));
    await waitFor(() =>
      expect(
        panggilan.some((p) => p.method === "POST" && p.url.pathname.endsWith("/unit-trailer/t1/nonaktifkan"))
      ).toBe(true)
    );
  });

  it("tidak ada tombol Ubah status — afkir lewat menu Penghapusan", () => {
    tampil();
    expect(screen.queryByText("Ubah status")).toBeNull();
  });
});

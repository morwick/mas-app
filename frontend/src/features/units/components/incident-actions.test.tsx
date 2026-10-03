/**
 * Aksi insiden: insiden Terbuka punya tombol "Selesaikan Tanpa Perbaikan"
 * (dengan teks bantu) yang langsung menutup insiden lewat endpoint khusus.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { labelStatusInsiden, type Incident } from "@/types";
import { BANTU_TANPA_PERBAIKAN, IncidentActionButtons, PESAN_DARI_GANTI_UNIT, useIncidentActions } from "./incident-actions";

const insiden = (status: Incident["status"]) => ({ id: "i1", status }) as Incident;

function Uji({ incident }: { incident: Incident }) {
  const aksi = useIncidentActions("unit TR-01");
  return (
    <>
      <IncidentActionButtons incident={incident} onAction={(a) => aksi.request(a, incident)} onEdit={() => {}} />
      {aksi.node}
    </>
  );
}

let panggilan: { method: string; path: string }[];

beforeEach(() => {
  panggilan = [];
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      panggilan.push({ method: init?.method ?? "GET", path: new URL(String(input)).pathname });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );
});

describe("Selesaikan Tanpa Perbaikan", () => {
  it("insiden Terbuka: tombol + teks bantu, konfirmasi memanggil endpoint khusus", async () => {
    render(
      <ToastProvider>
        <Uji incident={insiden("open")} />
      </ToastProvider>
    );
    expect(screen.getByText(BANTU_TANPA_PERBAIKAN)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Selesaikan Tanpa Perbaikan" }));
    expect(screen.getByText("Selesaikan tanpa perbaikan?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ya, selesaikan" }));
    await waitFor(() =>
      expect(panggilan).toContainEqual({ method: "POST", path: "/api/incidents/i1/resolve-tanpa-perbaikan" })
    );
  });

  it("insiden Dalam penanganan: tidak ada tombol tanpa perbaikan", () => {
    render(
      <ToastProvider>
        <Uji incident={insiden("in_progress")} />
      </ToastProvider>
    );
    expect(screen.queryByRole("button", { name: "Selesaikan Tanpa Perbaikan" })).toBeNull();
    expect(screen.queryByText(BANTU_TANPA_PERBAIKAN)).toBeNull();
    expect(screen.getByRole("button", { name: "Selesaikan perbaikan" })).toBeTruthy();
  });

  it("label status: Selesai (tanpa perbaikan)", () => {
    expect(labelStatusInsiden({ status: "resolved", ditutup_karena: "tanpa_perbaikan" })).toBe(
      "Selesai (tanpa perbaikan)"
    );
  });
});

describe("hapus insiden", () => {
  function tampil(incident: Incident) {
    render(
      <ToastProvider>
        <Uji incident={incident} />
      </ToastProvider>
    );
  }

  it("sukses: insiden biasa yang Terbuka → konfirmasi hapus lalu DELETE ke server", async () => {
    tampil(insiden("open"));
    fireEvent.click(screen.getByRole("button", { name: /Hapus/ }));
    expect(screen.getByText("Hapus catatan insiden?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(panggilan).toContainEqual({ method: "DELETE", path: "/api/incidents/i1" }));
  });

  it("edge: insiden operator yang terkait job (bukan ganti unit) tetap bisa dihapus", () => {
    tampil({ id: "i1", status: "open", job_id: "j1", dari_ganti_unit: false } as Incident);
    fireEvent.click(screen.getByRole("button", { name: /Hapus/ }));
    expect(screen.getByText("Hapus catatan insiden?")).toBeTruthy();
  });

  it("gagal: insiden dari ganti unit — tombol ada, tapi diklik langsung ditolak tanpa ke server", async () => {
    tampil({ id: "i1", status: "open", job_id: "j1", dari_ganti_unit: true } as Incident);
    fireEvent.click(screen.getByRole("button", { name: /Hapus/ }));
    expect(await screen.findByText(PESAN_DARI_GANTI_UNIT)).toBeTruthy();
    expect(screen.queryByText("Hapus catatan insiden?")).toBeNull();
    expect(panggilan).toEqual([]);
  });

  it("edge: insiden Dalam penanganan tidak punya tombol Hapus", () => {
    tampil(insiden("in_progress"));
    expect(screen.queryByRole("button", { name: /Hapus/ })).toBeNull();
  });
});

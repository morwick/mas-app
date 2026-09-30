/**
 * Aksi insiden: insiden Terbuka punya tombol "Selesaikan Tanpa Perbaikan"
 * (dengan teks bantu) yang langsung menutup insiden lewat endpoint khusus.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { labelStatusInsiden, type Incident } from "@/types";
import { BANTU_TANPA_PERBAIKAN, IncidentActionButtons, useIncidentActions } from "./incident-actions";

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

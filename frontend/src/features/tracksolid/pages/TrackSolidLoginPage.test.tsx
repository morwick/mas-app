/**
 * Login TrackSolid dibantu superadmin: butuh captcha → gambar langsung tampil,
 * kode diketik manual lalu dikirim; kode salah → captcha baru.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { TrackSolidLoginPage } from "./TrackSolidLoginPage";

let panggilan: { method: string; path: string; body: unknown }[];
let loginBerhasil: boolean;
let nomorCaptcha: number;

beforeEach(() => {
  panggilan = [];
  loginBerhasil = true;
  nomorCaptcha = 0;
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      panggilan.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (path.endsWith("/tracksolid/status"))
        return json({ tersambung: false, perlu_captcha: true, perlu_captcha_at: "2026-09-30T02:00:00Z", diperbarui_at: null, diperbarui_oleh_nama: null });
      if (path.endsWith("/tracksolid/captcha")) {
        nomorCaptcha += 1;
        return json({ gambar: `data:image/jpeg;base64,captcha${nomorCaptcha}` });
      }
      if (path.endsWith("/tracksolid/login"))
        return loginBerhasil ? json({ ok: true }) : json({ detail: "Kode captcha salah atau sudah kedaluwarsa." }, 422);
      return json([]);
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <TrackSolidLoginPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("TrackSolidLoginPage", () => {
  it("butuh captcha: gambar tampil, kode diketik lalu dikirim", async () => {
    renderPage();
    expect(await screen.findByText("Terputus — butuh captcha")).toBeTruthy();
    const img = (await screen.findByAltText("Captcha TrackSolid")) as HTMLImageElement;
    expect(img.src).toContain("captcha1");
    fireEvent.change(screen.getByLabelText("Kode captcha"), { target: { value: " ab12 " } });
    fireEvent.click(screen.getByRole("button", { name: "Login TrackSolid" }));
    await waitFor(() =>
      expect(panggilan).toContainEqual({ method: "POST", path: "/api/tracksolid/login", body: { kode: "ab12" } })
    );
  });

  it("kode salah → captcha baru diambil", async () => {
    loginBerhasil = false;
    renderPage();
    await screen.findByAltText("Captcha TrackSolid");
    fireEvent.change(screen.getByLabelText("Kode captcha"), { target: { value: "xxxx" } });
    fireEvent.click(screen.getByRole("button", { name: "Login TrackSolid" }));
    await waitFor(() =>
      expect(((screen.getByAltText("Captcha TrackSolid") as HTMLImageElement).src)).toContain("captcha2")
    );
  });
});

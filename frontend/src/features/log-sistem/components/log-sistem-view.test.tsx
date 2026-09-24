/**
 * Halaman Log Sistem: menampilkan log dari server dan meneruskan filter ke API.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogSistemView } from "@/features/log-sistem/components/log-sistem-view";

const LOG = {
  id: "l1",
  waktu: "2026-09-24T01:00:00+00:00",
  aksi: "Hapus Data",
  keterangan: "Data Penawaran 0001/SK/MAS/IX/2026 (ID q1)",
  ip_address: "203.0.113.7",
  karyawan_id: "k1",
  karyawan_nama: "Rika Sari"
};

let fetchMock: ReturnType<typeof vi.fn>;
let logUrls: URL[];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <LogSistemView />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  logUrls = [];
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/log-sistem")) {
      logUrls.push(url);
      return new Response(JSON.stringify({ items: [LOG], total: 1, page: 1, page_size: 20 }), { status: 200 });
    }
    // Daftar pengguna untuk pilihan karyawan.
    return new Response(JSON.stringify([]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("LogSistemView", () => {
  it("menampilkan karyawan, aksi, keterangan, dan IP", async () => {
    renderView();
    expect((await screen.findAllByText(/Data Penawaran 0001\/SK\/MAS\/IX\/2026/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rika Sari").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hapus Data").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/203\.0\.113\.7/).length).toBeGreaterThan(0);
  });

  it("filter aksi & pencarian diteruskan ke server, kembali ke halaman 1", async () => {
    renderView();
    await screen.findAllByText(/Data Penawaran/);

    fireEvent.click(screen.getByRole("button", { name: "Tambah Data" }));
    await waitFor(() => expect(logUrls.at(-1)?.searchParams.get("aksi")).toBe("Tambah Data"));

    fireEvent.change(screen.getByPlaceholderText("Cari keterangan atau IP…"), {
      target: { value: "penawaran" }
    });
    await waitFor(() => expect(logUrls.at(-1)?.searchParams.get("q")).toBe("penawaran"));
    expect(logUrls.at(-1)?.searchParams.get("page")).toBe("1");
  });

  it("default menampilkan 10 baris per halaman", async () => {
    renderView();
    await screen.findAllByText(/Data Penawaran/);
    expect(logUrls[0].searchParams.get("page_size")).toBe("10");
  });
});

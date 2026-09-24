/**
 * Kotak cari global: memanggil API setelah ketikan berhenti, menampilkan
 * hasil lintas entitas, dan membuka halaman detail saat hasil dipilih.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "@/components/layout/global-search";

const HITS = [
  { kind: "job", id: "j1", label: "JOB-001", sublabel: "PT Anugerah · Excavator", href: "/jobs/j1" },
  { kind: "unit", id: "u1", label: "SL09", sublabel: "Tronton · L 1234 AB", href: "/units/u1" },
  { kind: "driver", id: "d1", label: "Agus", sublabel: "08120000001", href: "/drivers/d1/edit" },
  { kind: "customer", id: "c1", label: "PT Anugerah", sublabel: "Surabaya", href: "/customers/c1/edit" },
  { kind: "quotation", id: "q1", label: "QUO-007", sublabel: "PT Anugerah", href: "/quotations/q1" }
];

let fetchMock: ReturnType<typeof vi.fn>;

function Where() {
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
}

function renderSearch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <GlobalSearch />
        <Where />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function box() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

/** Lewati jeda debounce (250ms) lalu tunggu hasilnya dirender. */
async function type(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  await vi.advanceTimersByTimeAsync(300);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.setItem(
    "mas_admin_session",
    JSON.stringify({ access_token: "t", refresh_token: "r", expires_at: Date.now() / 1000 + 3600, user: {} })
  );
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const q = url.searchParams.get("q") ?? "";
    return new Response(JSON.stringify({ query: q, hits: HITS }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function searchCalls() {
  return fetchMock.mock.calls.filter(([i]) => String(i).includes("/api/search"));
}

describe("GlobalSearch", () => {
  it("tidak memanggil API untuk satu huruf", async () => {
    renderSearch();
    await type("a");
    expect(searchCalls()).toHaveLength(0);
    expect(screen.getByText(/Ketik minimal 2 huruf/)).toBeTruthy();
  });

  it("memanggil API setelah ketikan berhenti", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(searchCalls().length).toBeGreaterThan(0));
    expect(String(searchCalls()[0][0])).toContain("q=anugerah");
  });

  it("menunda panggilan selama masih mengetik", async () => {
    renderSearch();
    fireEvent.change(box(), { target: { value: "an" } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(box(), { target: { value: "anu" } });
    await vi.advanceTimersByTimeAsync(100);
    // Belum melewati jeda penuh sejak ketikan terakhir.
    expect(searchCalls()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(searchCalls().length).toBe(1));
  });

  it("menampilkan hasil kelima entitas dengan penanda jenisnya", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5));
    for (const label of ["Job", "Unit", "Driver", "Customer", "Penawaran"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("JOB-001")).toBeTruthy();
    expect(screen.getByText("Tronton · L 1234 AB")).toBeTruthy();
  });

  it("klik hasil membuka halaman detailnya", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getByText("SL09")).toBeTruthy());

    fireEvent.click(screen.getByText("SL09"));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/units/u1"));
  });

  it("panah bawah lalu Enter membuka hasil yang disorot", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5));

    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    // Sorotan mulai di indeks 0, satu panah bawah → unit.
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/units/u1"));
  });

  it("tiap jenis mengarah ke rutenya masing-masing", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5));

    fireEvent.click(screen.getByText("Agus"));
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/drivers/d1/edit")
    );
  });

  it("menutup panel dan mengosongkan kotak setelah memilih", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getByText("QUO-007")).toBeTruthy());

    fireEvent.click(screen.getByText("QUO-007"));
    await waitFor(() => expect(box().value).toBe(""));
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("Escape mengosongkan kotak tanpa berpindah halaman", async () => {
    renderSearch();
    await type("anugerah");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(5));

    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box().value).toBe("");
    expect(screen.getByTestId("path").textContent).toBe("/dashboard");
  });

  it("memberi tahu saat tidak ada hasil", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ query: "zzz", hits: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    );
    renderSearch();
    await type("zzz");
    await waitFor(() => expect(screen.getByText(/Tidak ada hasil untuk "zzz"/)).toBeTruthy());
  });

  it("Ctrl+K memindahkan fokus ke kotak cari", async () => {
    renderSearch();
    expect(document.activeElement).not.toBe(box());
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(box()));
  });
});

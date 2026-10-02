/**
 * Popup loading global: muncul untuk data yang belum ada / dinyatakan usang
 * (setelah simpan / hapus), setelah jeda singkat; tidak untuk query latar.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { Query } from "@tanstack/react-query";
import { queryMembuatMemuat, useMemuatHalaman } from "./use-memuat-halaman";

function q(state: { data?: unknown; isInvalidated?: boolean }, meta?: Record<string, unknown>): Query {
  return { meta, state: { data: state.data, isInvalidated: state.isInvalidated ?? false } } as unknown as Query;
}

describe("queryMembuatMemuat", () => {
  it("data belum ada → memuat", () => {
    expect(queryMembuatMemuat(q({}))).toBe(true);
  });
  it("data usang setelah simpan / hapus → memuat", () => {
    expect(queryMembuatMemuat(q({ data: [1], isInvalidated: true }))).toBe(true);
  });
  it("pembaruan berkala / kembali ke tab (data masih valid) → tidak", () => {
    expect(queryMembuatMemuat(q({ data: [1] }))).toBe(false);
  });
  it("query latar (lonceng, angka menu) → tidak pernah", () => {
    expect(queryMembuatMemuat(q({}, { latar: true }))).toBe(false);
  });
});

function Penanda({ latar }: { latar?: boolean }) {
  useQuery({
    queryKey: ["uji", latar],
    queryFn: () => new Promise(() => {}),
    meta: latar ? { latar: true } : undefined
  });
  return <div>{useMemuatHalaman(400) ? "POPUP" : "tanpa popup"}</div>;
}

describe("useMemuatHalaman", () => {
  it("muncul setelah 400 ms bila data halaman belum datang; tidak untuk query latar", () => {
    vi.useFakeTimers();
    const klien = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={klien}>
        <Penanda />
      </QueryClientProvider>
    );
    expect(screen.getByText("tanpa popup")).toBeTruthy();
    act(() => vi.advanceTimersByTime(450));
    expect(screen.getByText("POPUP")).toBeTruthy();
    unmount();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Penanda latar />
      </QueryClientProvider>
    );
    act(() => vi.advanceTimersByTime(450));
    expect(screen.getByText("tanpa popup")).toBeTruthy();
    vi.useRealTimers();
  });
});

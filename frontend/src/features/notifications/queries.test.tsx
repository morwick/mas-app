/** Notifikasi web diambil dari backend tiap 30 detik — juga saat tab tidak aktif. */

import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFIKASI_POLL_MS, useNotificationPage, useNotifications } from "./queries";

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(async () => []),
  listNotificationsPage: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 10 }))
}));
vi.mock("./api", () => api);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function maju(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  api.listNotifications.mockClear();
  api.listNotificationsPage.mockClear();
});

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("polling notifikasi", () => {
  it("interval 30 detik", () => {
    expect(NOTIFIKASI_POLL_MS).toBe(30_000);
  });

  it("lonceng mengambil ulang tiap 30 detik", async () => {
    renderHook(() => useNotifications(), { wrapper });
    await maju(0);
    expect(api.listNotifications).toHaveBeenCalledTimes(1);

    await maju(29_000);
    expect(api.listNotifications).toHaveBeenCalledTimes(1);
    await maju(1_000);
    expect(api.listNotifications).toHaveBeenCalledTimes(2);
    await maju(30_000);
    expect(api.listNotifications).toHaveBeenCalledTimes(3);
  });

  it("tetap mengambil saat tab browser tidak aktif", async () => {
    renderHook(() => useNotifications(), { wrapper });
    await maju(0);
    focusManager.setFocused(false);
    await maju(60_000);
    expect(api.listNotifications).toHaveBeenCalledTimes(3);
  });

  it("halaman Notifikasi juga diperbarui tiap 30 detik", async () => {
    renderHook(() => useNotificationPage(1, 10), { wrapper });
    await maju(0);
    await maju(30_000);
    expect(api.listNotificationsPage).toHaveBeenCalledTimes(2);
  });
});

/**
 * Klien HTTP ke backend FastAPI.
 *
 * - Menyisipkan `Authorization: Bearer <jwt>` untuk admin, `X-Driver-Token`
 *   untuk portal driver — dipilih lewat opsi `auth`.
 * - Kalau access token admin hampir habis, refresh dulu (sekali, dibagi antar
 *   request yang bersamaan). 401 setelah refresh berarti sesi mati → sesi
 *   dihapus dan pendengar `onUnauthorized` (router) mengarahkan ke login.
 * - Error server berbentuk `{ detail: string, ... }` dan dilempar sebagai
 *   `ApiError` supaya pemanggil bisa menampilkan pesannya apa adanya.
 */

import { adminSession, driverSession, isExpiringSoon, type AdminSession } from "@/lib/auth/session";
import type { ActionResult } from "@/types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export type AuthMode = "admin" | "driver" | "none";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Dikirim sebagai JSON. Abaikan bila `form` dipakai. */
  body?: unknown;
  /** Multipart (upload foto). */
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: AuthMode;
  signal?: AbortSignal;
}

type UnauthorizedListener = (mode: Exclude<AuthMode, "none">) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}/api${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<AdminSession | null> | null = null;

async function refreshAdminSession(): Promise<AdminSession | null> {
  if (refreshInFlight) return refreshInFlight;
  const current = adminSession.get();
  if (!current?.refresh_token) return null;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token })
      });
      if (!res.ok) return null;
      const next = (await res.json()) as AdminSession;
      adminSession.set(next);
      return next;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function authHeaders(mode: AuthMode): Promise<Record<string, string>> {
  if (mode === "admin") {
    let s = adminSession.get();
    if (s && isExpiringSoon(s)) s = (await refreshAdminSession()) ?? s;
    return s ? { Authorization: `Bearer ${s.access_token}` } : {};
  }
  if (mode === "driver") {
    const s = driverSession.get();
    return s ? { "X-Driver-Token": s.token } : {};
  }
  return {};
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* bukan JSON */
  }
  const detail = body.detail;
  const message =
    typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? // Error validasi Pydantic: ambil pesan pertama yang bisa dibaca.
          String((detail[0] as { msg?: string })?.msg ?? "Data tidak valid").replace(
            /^Value error, /,
            ""
          )
        : `Permintaan gagal (${res.status})`;
  return new ApiError(res.status, message, body);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const mode = opts.auth ?? "admin";
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { ...(await authHeaders(mode)) };
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal
    });
  };

  let res = await doFetch();

  // Token admin ditolak → coba refresh sekali lalu ulangi.
  if (res.status === 401 && mode === "admin" && adminSession.get()) {
    const refreshed = await refreshAdminSession();
    if (refreshed) res = await doFetch();
  }

  if (res.status === 401 && mode !== "none") {
    if (mode === "admin") adminSession.clear();
    else driverSession.clear();
    unauthorizedListeners.forEach((l) => l(mode));
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Bungkus panggilan API menjadi ActionResult — bentuk yang dipakai form. */
export async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Terjadi kesalahan" };
  }
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], auth?: AuthMode) =>
    request<T>(path, { query, auth }),
  post: <T>(path: string, body?: unknown, auth?: AuthMode) =>
    request<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body?: unknown, auth?: AuthMode) =>
    request<T>(path, { method: "PUT", body, auth }),
  patch: <T>(path: string, body?: unknown, auth?: AuthMode) =>
    request<T>(path, { method: "PATCH", body, auth }),
  delete: <T>(path: string, auth?: AuthMode) => request<T>(path, { method: "DELETE", auth }),
  upload: <T>(path: string, form: FormData, auth?: AuthMode) =>
    request<T>(path, { method: "POST", form, auth })
};

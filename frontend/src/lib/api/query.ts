/**
 * QueryClient tunggal + bantuan mutasi.
 *
 * Setelah mutasi berhasil, semua query di-invalidate. Datanya kecil (ratusan
 * baris) dan halaman-halaman saling bergantung (job memengaruhi unit, uang
 * jalan, dashboard, notifikasi), jadi invalidasi menyeluruh lebih aman
 * daripada daftar kunci yang gampang ketinggalan.
 */

import { QueryClient } from "@tanstack/react-query";
import { toResult } from "@/lib/api/client";
import type { ActionResult } from "@/types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        // Jangan mengulang error yang memang jawaban final (401/403/404/410/422).
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true
    }
  }
});

/** Jalankan mutasi lalu segarkan cache; hasilnya dalam bentuk ActionResult. */
export async function mutate<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  const result = await toResult(promise);
  if (result.ok) await queryClient.invalidateQueries();
  return result;
}

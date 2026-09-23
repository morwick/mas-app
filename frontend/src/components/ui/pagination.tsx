/**
 * Pagination untuk daftar. Memotong baris di sisi klien supaya tabel panjang
 * tidak merender ratusan baris sekaligus.
 *
 * Catatan: ini meringankan render, bukan jumlah data yang diambil dari API —
 * endpoint-nya masih mengirim seluruh baris. Untuk memangkas itu perlu
 * limit/offset di backend.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const DEFAULT_PAGE_SIZE = 20;

interface UsePaginationOptions {
  pageSize?: number;
  /**
   * Nilai gabungan dari semua filter/pencarian. Begitu berubah, halaman
   * kembali ke 1 — kalau tidak, hasil filter yang cuma 3 baris bisa tampil
   * kosong karena posisi masih di halaman 5.
   */
  resetKey?: string;
}

export interface PaginationState<T> {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Baris untuk halaman yang sedang tampil. */
  items: T[];
  /** Indeks baris pertama halaman ini (basis 1); 0 bila kosong. */
  from: number;
  to: number;
  setPage: (p: number) => void;
}

export function usePagination<T>(
  rows: T[],
  { pageSize = DEFAULT_PAGE_SIZE, resetKey = "" }: UsePaginationOptions = {}
): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);

  // Disetel ulang saat render, bukan lewat useEffect. Dengan useEffect,
  // perubahan filter yang sekaligus menyusutkan data membuat reset ke halaman 1
  // beradu dengan penjepit di bawah — dan penjepitnya yang menang.
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Data bisa menyusut di luar perubahan filter (mis. setelah hapus), jadi
  // posisi halaman tetap dijaga agar tidak melewati batas.
  const current = Math.min(Math.max(1, page), pageCount);

  useEffect(() => {
    if (page !== current) setPage(current);
  }, [page, current]);

  const items = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize]
  );

  return {
    page: current,
    pageCount,
    total,
    pageSize,
    items,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
    setPage
  };
}

/** Nomor halaman yang ditampilkan, dengan elipsis bila terlalu banyak. */
function pageNumbers(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

interface PaginationProps {
  state: PaginationState<unknown>;
  /** Kata benda untuk teks ringkasan, mis. "unit" → "1–20 dari 134 unit". */
  label?: string;
  /**
   * True bila dipasang langsung di bawah tabel dalam satu kartu — hanya
   * bergaris pemisah di atas. Default berdiri sendiri dengan kotaknya sendiri.
   */
  attached?: boolean;
}

export function Pagination({ state, label = "baris", attached }: PaginationProps) {
  const { page, pageCount, total, from, to, setPage } = state;
  // Satu halaman penuh tidak butuh kontrol apa pun.
  if (total === 0) return null;

  return (
    <div className={attached ? "pagination pagination-attached" : "pagination"}>
      <span className="pagination-info">
        {from}–{to} dari {total} {label}
      </span>
      {pageCount > 1 && (
        <div className="pagination-controls">
          <button
            type="button"
            className="pagination-btn"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft style={{ width: 15, height: 15 }} />
          </button>
          {pageNumbers(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="pagination-gap">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className="pagination-btn"
                data-active={n === page}
                aria-current={n === page ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )
          )}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      )}
    </div>
  );
}

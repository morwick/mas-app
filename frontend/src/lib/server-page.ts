import { ALL_PAGE_SIZE, type PaginationState } from "@/components/ui/pagination";

/** Satu halaman hasil server (`{items, total, page, page_size}`). */
export interface ServerPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * State komponen `Pagination` untuk daftar yang dipotong di server
 * (LIMIT/OFFSET). `onPageSize` dipanggil saat ukuran halaman diganti —
 * pemanggil biasanya ikut kembali ke halaman 1.
 */
export function serverPageState<T>(
  data: ServerPage<T> | undefined,
  page: number,
  pageSize: number,
  setPage: (p: number) => void,
  onPageSize: (s: number) => void
): PaginationState<T> {
  const total = data?.total ?? 0;
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / size)),
    total,
    pageSize,
    items: data?.items ?? [],
    from: total === 0 ? 0 : (page - 1) * size + 1,
    to: Math.min(page * size, total),
    setPage,
    setPageSize: onPageSize
  };
}

/** Nomor HP → tautan WhatsApp (08xx / +628xx / 628xx → 628xx). */
export function tautanWhatsApp(noHp: string): string | null {
  let digit = noHp.replace(/[^0-9]/g, "");
  if (digit.startsWith("0")) digit = "62" + digit.slice(1);
  if (digit.length < 9) return null;
  return `https://wa.me/${digit}`;
}

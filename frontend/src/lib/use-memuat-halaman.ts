import { useEffect, useState } from "react";
import { useIsFetching, type Query } from "@tanstack/react-query";

/**
 * Query yang membuat halaman "sedang memuat": datanya belum ada sama sekali
 * (halaman baru dibuka / filter diganti) atau sudah dinyatakan usang setelah
 * simpan / hapus. Pembaruan berkala dan penyegaran saat kembali ke tab tidak
 * dihitung — datanya masih valid. Query bertanda `meta: { latar: true }`
 * (lonceng, angka menu, menu Approval) tidak pernah dihitung.
 */
export function queryMembuatMemuat(q: Query): boolean {
  if (q.meta?.latar === true) return false;
  return q.state.data === undefined || q.state.isInvalidated;
}

/**
 * True selama ada data halaman yang sedang dimuat / dimuat ulang — dipakai
 * popup loading global di layout. Muncul setelah `tundaMs` supaya tidak
 * berkedip bila datanya cepat datang.
 */
export function useMemuatHalaman(tundaMs = 400): boolean {
  const memuat = useIsFetching({ predicate: queryMembuatMemuat }) > 0;
  const [tampil, setTampil] = useState(false);
  useEffect(() => {
    if (!memuat) {
      setTampil(false);
      return;
    }
    const t = window.setTimeout(() => setTampil(true), tundaMs);
    return () => window.clearTimeout(t);
  }, [memuat, tundaMs]);
  return tampil;
}

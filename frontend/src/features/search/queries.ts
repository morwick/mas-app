import { useQuery } from "@tanstack/react-query";
import { globalSearch, MIN_SEARCH_LENGTH } from "./api";

export function useGlobalSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => globalSearch(q),
    // Di bawah panjang minimum hasilnya pasti kosong — tidak perlu memanggil API.
    enabled: q.length >= MIN_SEARCH_LENGTH,
    // Hasil pencarian boleh sedikit basi; ini mencegah request berulang saat
    // pengguna menghapus lalu mengetik ulang kata yang sama.
    staleTime: 30_000
  });
}

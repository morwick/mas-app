import { useQuery } from "@tanstack/react-query";
import { listKecamatan } from "./api";

// Data referensi jarang berubah — cukup dimuat sekali per sesi.
export const useKecamatan = () =>
  useQuery({ queryKey: ["kecamatan"], queryFn: listKecamatan, staleTime: Infinity, gcTime: Infinity });

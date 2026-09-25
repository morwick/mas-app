import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { asetPilihan, getPenjualan, listPenjualan, type JenisAset, type PenjualanFilter } from "./api";

export const usePenjualanList = (filter: PenjualanFilter) =>
  useQuery({
    queryKey: ["penjualan-unit", filter],
    queryFn: () => listPenjualan(filter),
    placeholderData: keepPreviousData
  });

export const usePenjualanDetail = (id: string | null) =>
  useQuery({
    queryKey: ["penjualan-unit", "detail", id],
    queryFn: () => getPenjualan(id as string),
    enabled: Boolean(id)
  });

export const useAsetPilihan = (jenisAset: JenisAset, enabled: boolean) =>
  useQuery({
    queryKey: ["penjualan-unit", "aset-pilihan", jenisAset],
    queryFn: () => asetPilihan(jenisAset),
    enabled
  });

import { useQuery } from "@tanstack/react-query";
import {
  getQuotation,
  listQuotations,
  quotationJobs,
  rekomendasiHarga,
  type RekomendasiHargaParams
} from "./api";

export const useQuotations = () =>
  useQuery({ queryKey: ["quotations", "list"], queryFn: () => listQuotations() });

export const useQuotation = (id: string | undefined) =>
  useQuery({ queryKey: ["quotations", "detail", id], queryFn: () => getQuotation(id!), enabled: !!id });

export const useQuotationJobs = (id: string | undefined) =>
  useQuery({ queryKey: ["quotations", "jobs", id], queryFn: () => quotationJobs(id!), enabled: !!id });

/** `null` = rute / jenis unit belum lengkap → tidak memanggil server. */
export const useRekomendasiHarga = (params: RekomendasiHargaParams | null) =>
  useQuery({
    queryKey: ["quotations", "rekomendasi-harga", params],
    queryFn: () => rekomendasiHarga(params!),
    enabled: !!params,
    staleTime: 60_000
  });

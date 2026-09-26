import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getUnitIncidents } from "@/features/units/api";
import { getUnitTrailerIncidents } from "@/features/unit-trailer/api";
import {
  asetDihapusPilihan,
  getPenghapusan,
  listPenghapusan,
  type JenisAset,
  type PenghapusanFilter
} from "./api";

export const usePenghapusanList = (filter: PenghapusanFilter) =>
  useQuery({
    queryKey: ["penghapusan-aset", filter],
    queryFn: () => listPenghapusan(filter),
    placeholderData: keepPreviousData
  });

export const useAsetDihapusPilihan = (jenisAset: JenisAset, enabled: boolean) =>
  useQuery({
    queryKey: ["penghapusan-aset", "aset-pilihan", jenisAset],
    queryFn: () => asetDihapusPilihan(jenisAset),
    enabled
  });

/** Insiden aset — untuk memilih status insiden yang dibuka lagi saat batal. */
export const useInsidenAset = (jenisAset: JenisAset | null, assetId: string | null) =>
  useQuery({
    queryKey: ["penghapusan-aset", "insiden", jenisAset, assetId],
    queryFn: () =>
      jenisAset === "unit" ? getUnitIncidents(assetId as string) : getUnitTrailerIncidents(assetId as string),
    enabled: Boolean(jenisAset && assetId)
  });

export const usePenghapusanDetail = (id: string | null) =>
  useQuery({
    queryKey: ["penghapusan-aset", "detail", id],
    queryFn: () => getPenghapusan(id as string),
    enabled: Boolean(id)
  });

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  asuransiCounts,
  getAsuransi,
  listAsuransi,
  listAsuransiPage,
  listPolisAset,
  listPolisMilikAsuransi,
  polisBerlaku,
  type AsetPolis,
  type AsuransiFilter
} from "./api";

export const useAsuransiPage = (f: AsuransiFilter) =>
  useQuery({ queryKey: ["asuransi", "page", f], queryFn: () => listAsuransiPage(f), placeholderData: keepPreviousData });

export const useAsuransiCounts = (q: string) =>
  useQuery({ queryKey: ["asuransi", "counts", q], queryFn: () => asuransiCounts(q) });

export const useAsuransiList = (includeInactive = false) =>
  useQuery({ queryKey: ["asuransi", "list", includeInactive], queryFn: () => listAsuransi(includeInactive) });

export const useAsuransi = (id: string | undefined) =>
  useQuery({ queryKey: ["asuransi", "detail", id], queryFn: () => getAsuransi(id!), enabled: !!id });

export const usePolisMilikAsuransi = (id: string | undefined) =>
  useQuery({ queryKey: ["asuransi", "polis", id], queryFn: () => listPolisMilikAsuransi(id!), enabled: !!id });

export const usePolisAset = (aset: AsetPolis | null) =>
  useQuery({ queryKey: ["polis", "aset", aset], queryFn: () => listPolisAset(aset!), enabled: !!aset });

export const usePolisBerlaku = (aset: AsetPolis | null, tanggal: string) =>
  useQuery({
    queryKey: ["polis", "berlaku", aset, tanggal],
    queryFn: () => polisBerlaku(aset!, tanggal),
    enabled: !!aset && !!tanggal
  });

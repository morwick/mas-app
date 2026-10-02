import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getProyek,
  listProyek,
  listProyekPerUnit,
  type ProyekFilter,
  type ProyekPerUnitFilter
} from "./api";

export const useProyekPage = (filter: ProyekFilter) =>
  useQuery({
    queryKey: ["proyek", "page", filter],
    queryFn: () => listProyek(filter),
    // Tetap tampilkan halaman sebelumnya selama halaman berikutnya dimuat.
    placeholderData: keepPreviousData
  });

export const useProyek = (id: string | undefined) =>
  useQuery({ queryKey: ["proyek", "detail", id ?? ""], queryFn: () => getProyek(id!), enabled: !!id });

export const useProyekPerUnit = (filter: ProyekPerUnitFilter) =>
  useQuery({
    queryKey: ["proyek", "per-unit", filter],
    queryFn: () => listProyekPerUnit(filter),
    placeholderData: keepPreviousData
  });

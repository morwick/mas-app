import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getUnitTrailer,
  getUnitTrailerHistory,
  getUnitTrailerIncidents,
  getUnitTrailerJobs,
  listJenisUnitTrailer,
  listUnitTrailer,
  trailerUntukUnit,
  type UnitTrailerFilter
} from "./api";

export const useJenisUnitTrailer = () =>
  useQuery({ queryKey: ["jenis-unit-trailer"], queryFn: listJenisUnitTrailer });

/** Pilihan unit trailer untuk unit yang dipilih di form job (kosong = belum pilih unit). */
export const useTrailerUntukUnit = (unitId: string) =>
  useQuery({
    queryKey: ["unit-trailer", "untuk-unit", unitId],
    queryFn: () => trailerUntukUnit(unitId),
    enabled: Boolean(unitId)
  });

export const useUnitTrailer = (filter: UnitTrailerFilter) =>
  useQuery({
    queryKey: ["unit-trailer", filter],
    queryFn: () => listUnitTrailer(filter),
    // Halaman sebelumnya tetap tampil selama halaman berikutnya dimuat.
    placeholderData: keepPreviousData
  });

// ── Detail unit trailer ─────────────────────────────────────────────────────
export const useUnitTrailerDetail = (id: string) =>
  useQuery({ queryKey: ["unit-trailer", "detail", id], queryFn: () => getUnitTrailer(id), enabled: Boolean(id) });

export const useUnitTrailerJobs = (id: string) =>
  useQuery({ queryKey: ["unit-trailer", "jobs", id], queryFn: () => getUnitTrailerJobs(id), enabled: Boolean(id) });

export const useUnitTrailerIncidents = (id: string) =>
  useQuery({
    queryKey: ["unit-trailer", "incidents", id],
    queryFn: () => getUnitTrailerIncidents(id),
    enabled: Boolean(id)
  });

export const useUnitTrailerHistory = (id: string) =>
  useQuery({
    queryKey: ["unit-trailer", "history", id],
    queryFn: () => getUnitTrailerHistory(id),
    enabled: Boolean(id)
  });

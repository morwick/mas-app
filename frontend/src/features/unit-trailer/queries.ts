import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
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

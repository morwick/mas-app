import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listKaryawan, type KaryawanFilter } from "./api";

export const useKaryawanList = (filter: KaryawanFilter) =>
  useQuery({
    queryKey: ["karyawan", filter],
    queryFn: () => listKaryawan(filter),
    placeholderData: keepPreviousData
  });

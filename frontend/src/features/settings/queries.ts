import { useQuery } from "@tanstack/react-query";
import { listJenisUnit, listKaryawanTersedia, listUsers } from "./api";

export const useJenisUnit = () => useQuery({ queryKey: ["jenis-unit"], queryFn: listJenisUnit });
export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: listUsers });
export const useKaryawanTersedia = (enabled: boolean) =>
  useQuery({ queryKey: ["karyawan-tersedia"], queryFn: listKaryawanTersedia, enabled });

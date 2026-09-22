import { useQuery } from "@tanstack/react-query";
import { listJenisUnit, listUsers } from "./api";

export const useJenisUnit = () => useQuery({ queryKey: ["jenis-unit"], queryFn: listJenisUnit });
export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: listUsers });

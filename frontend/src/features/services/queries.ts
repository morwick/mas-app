import { useQuery } from "@tanstack/react-query";
import { listUnitsWithService } from "./api";

export const useUnitsWithService = () =>
  useQuery({ queryKey: ["maintenance", "units"], queryFn: listUnitsWithService });

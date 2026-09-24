import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listLogSistem, type LogSistemFilter } from "./api";

export const useLogSistem = (filter: LogSistemFilter) =>
  useQuery({
    queryKey: ["log-sistem", filter],
    queryFn: () => listLogSistem(filter),
    // Tetap tampilkan halaman sebelumnya selama halaman berikutnya dimuat.
    placeholderData: keepPreviousData
  });

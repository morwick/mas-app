import { useQuery } from "@tanstack/react-query";
import { listSales } from "./api";

// Sales baru tersimpan bersama job-nya; simpan job menyegarkan semua query,
// jadi daftar ini ikut terbarui.
export const useSales = () => useQuery({ queryKey: ["sales"], queryFn: listSales });

import { api } from "@/lib/api/client";

/** Master sales — dipilih / diketik di Detail Pengiriman job. */
export interface Sales {
  id: string;
  nama: string;
  no_hp: string | null;
}

export const listSales = () => api.get<Sales[]>("/sales");

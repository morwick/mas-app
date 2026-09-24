import { api } from "@/lib/api/client";

export type SearchKind = "job" | "unit" | "driver" | "customer" | "quotation";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  label: string;
  sublabel?: string | null;
  /** Tujuan navigasi; ditentukan server agar klien tidak perlu tahu pola rute. */
  href: string;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
}

/** Panjang minimum harus sama dengan MIN_QUERY_LENGTH di backend. */
export const MIN_SEARCH_LENGTH = 2;

export const globalSearch = (q: string) => api.get<SearchResponse>("/search", { q });
